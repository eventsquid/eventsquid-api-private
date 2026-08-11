/**
 * Authorize.Net functions
 * Migrated from Mantle functions/auth-net
 * 
 * NOTE: Requires 'authorizenet' package - add to package.json:
 * "authorizenet": "^1.0.6"
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { getDatabase } from '../utils/mongodb.js';
import { recordRefund } from './paymentTransactions/recordRefund.js';
import { sendUnconfirmedPaymentAlerts } from './paymentTransactions.js';
import _attendeeService from '../services/AttendeeService.js';
import _eventService from '../services/EventService.js';
import _ from 'lodash';
import moment from 'moment-timezone';

// Mirrors Mantle CONSTANTS._dm — per-vertical app domain for email links
const DOMAINS_BY_VERTICAL = {
  cn: 'https://www.connectmeetings.events',
  es: 'https://www.eventsquid.com',
  fd: 'https://www.rcnation.com',
  ft: 'https://www.fitsquid.com',
  ir: 'https://inreachce.events',
  kt: 'https://app.mykindercamps.com',
  ln: 'https://www.launchsquid.com'
};

// Import authorizenet SDK (will need to be installed)
// NOTE: This is a dynamic import that will fail if package is not installed
// The functions will handle this gracefully
let ApiContracts, ApiControllers, SDKConstants;

async function loadAuthorizeNet() {
  try {
    const authorizenetModule = await import('authorizenet');
    const authorizenet = authorizenetModule.default || authorizenetModule;
    ApiContracts = authorizenet.APIContracts;
    ApiControllers = authorizenet.APIControllers;
    SDKConstants = authorizenet.Constants;
    authNetLoaded = Boolean(ApiContracts && ApiControllers);
    return authNetLoaded;
  } catch (error) {
    console.warn('authorizenet package not installed - AuthNet functions will not work', error);
    authNetLoaded = false;
    return false;
  }
}

// Load on module initialization
let authNetLoaded = false;
loadAuthorizeNet().then(loaded => { authNetLoaded = loaded; });

/**
 * Sync the attendee's transaction list and total paid from MSSQL into MongoDB.
 * Mirrors Mantle functions/paymentTransactions/updateTransactionsMongo.js
 */
async function updateTransactionsMongo(attendeeID, vert) {
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const totalPaidRequest = new sql.Request();
  totalPaidRequest.input('attendeeID', TYPES.Int, Number(attendeeID));
  const totalPaidResult = await totalPaidRequest.query(`
    USE ${dbName};
    DECLARE @regTotalPaid DECIMAL(10,2);
    SET @regTotalPaid = ISNULL((
      SELECT SUM(ISNULL(amount, 0))
      FROM contestant_transactions
      WHERE contestant_id = @attendeeID
    ), 0);
    SELECT @regTotalPaid AS regTotalPaid;
  `);

  const transactionsRequest = new sql.Request();
  transactionsRequest.input('attendeeID', TYPES.Int, Number(attendeeID));
  const transactionsResult = await transactionsRequest.query(`
    USE ${dbName};
    SELECT
      amount       AS [am],
      processDate  AS [pd],
      processDate  AS [pdi],
      processID    AS [pi],
      processToken AS [ptk],
      payMethod    AS pm
    FROM contestant_transactions
    WHERE contestant_id = @attendeeID;
  `);

  const totalPaid = Number(totalPaidResult.recordset[0]?.regTotalPaid || 0);
  const transactions = transactionsResult.recordset || [];

  const db = await getDatabase(null, vert);
  await db.collection('attendees').updateOne(
    { c: Number(attendeeID), sg: { $exists: false } },
    {
      $currentDate: { lu: { $type: 'date' } },
      $set: { tr: transactions, tp: totalPaid }
    }
  );

  return { totalPaid, transactionCount: transactions.length };
}

/**
 * Call dbo.node_updateTransaction then sync MongoDB.
 * Mirrors Mantle functions/paymentTransactions/updateTransaction.js
 */
async function updateTransaction(attendeeID, params, vert) {
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const sqlRequest = new sql.Request();
  sqlRequest.input('failed',       TYPES.Bit,      params.failed ? 1 : 0);
  sqlRequest.input('attendeeID',   TYPES.Int,      Number(attendeeID));
  sqlRequest.input('processDate',  TYPES.DateTime, params.pdi);
  sqlRequest.input('processID',    TYPES.VarChar,  _.truncate(_.trim(params.pi),       { length: 150, omission: '' }));
  sqlRequest.input('processToken', TYPES.VarChar,  _.truncate(_.trim(params.ptk),      { length: 150, omission: '' }));
  sqlRequest.input('pending',      TYPES.Bit,      Number(params.pending));
  sqlRequest.input('payMethod',    TYPES.VarChar,  _.truncate(_.trim(params.py || ''), { length: 50,  omission: '' }));
  sqlRequest.input('processIDNew', TYPES.VarChar,  _.truncate(_.trim(params.piNew || ''), { length: 150, omission: '' }));

  await sqlRequest.query(`
    USE ${dbName};
    EXEC dbo.node_updateTransaction @failed, @attendeeID, @processDate, @processID, @processToken, @pending, @payMethod, @processIDNew
  `);

  await updateTransactionsMongo(attendeeID, vert);
}

/**
 * Get credentials by affiliate ID
 */
export async function getCredentials(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_authNetCredsByAffiliate @affiliateID
    `);

    return result.recordset || [];
  } catch (error) {
    console.error('Error getting AuthNet credentials:', error);
    throw error;
  }
}

/**
 * Get credentials by attendee ID
 */
export async function getCredentialsByAttendee(attendeeID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('attendeeID', sql.Int, Number(attendeeID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_authNetCredsByAttendee @attendeeID
    `);

    return result.recordset || [];
  } catch (error) {
    console.error('Error getting AuthNet credentials by attendee:', error);
    throw error;
  }
}

/**
 * Get merchant details (public key, etc.)
 */
export async function getMerchantDetails(request) {
  try {
    if (!authNetLoaded) {
      await loadAuthorizeNet();
    }
    if (!ApiContracts || !ApiControllers) {
      throw new Error('authorizenet package not installed');
    }

    const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
    let credsRA = [];

    if (request.pathParameters?.affiliateID) {
      credsRA = await getCredentials(request.pathParameters.affiliateID, vert);
    } else if (request.pathParameters?.attendeeID) {
      credsRA = await getCredentialsByAttendee(request.pathParameters.attendeeID, vert);
    }

    if (credsRA.length === 1 && _.trim(credsRA[0].login) !== '' && _.trim(credsRA[0].key) !== '') {
      const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
      merchantAuthenticationType.setName(credsRA[0].login);
      merchantAuthenticationType.setTransactionKey(credsRA[0].key);

      const getRequest = new ApiContracts.GetMerchantDetailsRequest();
      getRequest.setMerchantAuthentication(merchantAuthenticationType);

      const ctrl = new ApiControllers.GetMerchantDetailsController(getRequest.getJSON());

      // Set environment based on sandbox setting
      if (Number(credsRA[0].auth_sandbox) === 0) {
        ctrl.setEnvironment(SDKConstants.endpoint.production);
      }

      return new Promise((resolve) => {
        ctrl.execute(function() {
          const apiResponse = ctrl.getResponse();
          const response = new ApiContracts.GetMerchantDetailsResponse(apiResponse);

          // Trap errors
          if (apiResponse.messages?.resultCode === 'Error') {
            resolve(apiResponse);
            return;
          }
          if (response.messages?.resultCode === 'Error') {
            resolve(response);
            return;
          }

          // If successful
          if (response.messages && response.publicClientKey && 
              response.messages.resultCode?.toLowerCase() === 'ok' && 
              response.messages.message?.[0]?.code?.toLowerCase() === 'i00001') {
            resolve({
              login: credsRA[0].login,
              transactionKey: credsRA[0].key,
              publicClientKey: response.publicClientKey,
              affiliateID: Number(request.pathParameters?.affiliateID || credsRA[0].affiliate_id),
              testMode: Number(response.isTestMode),
              auth_sandbox: Number(credsRA[0].auth_sandbox)
            });
          } else {
            resolve({ error: 'Unexpected response format' });
          }
        });
      });
    } else {
      return { error: 'no credentials found' };
    }
  } catch (error) {
    console.error('Error getting merchant details:', error);
    throw error;
  }
}

/**
 * Get transaction details
 */
export async function getTransactionDetails(request) {
  try {
    if (!authNetLoaded) {
      await loadAuthorizeNet();
    }
    if (!ApiContracts || !ApiControllers) {
      throw new Error('authorizenet package not installed');
    }

    const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
    const affiliateID = request.pathParameters?.affiliateID || request.body?.affiliateID;
    const transactionID = request.pathParameters?.transactionID;

    const credsRA = await getCredentials(affiliateID, vert);

    if (credsRA.length === 1 && _.trim(credsRA[0].login) !== '' && _.trim(credsRA[0].key) !== '') {
      const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
      merchantAuthenticationType.setName(credsRA[0].login);
      merchantAuthenticationType.setTransactionKey(credsRA[0].key);

      const getRequest = new ApiContracts.GetTransactionDetailsRequest();
      getRequest.setMerchantAuthentication(merchantAuthenticationType);
      getRequest.setTransId(transactionID);

      const ctrl = new ApiControllers.GetTransactionDetailsController(getRequest.getJSON());

      // Set environment
      if (Number(credsRA[0].auth_sandbox) === 0 || !credsRA[0].auth_sandbox) {
        ctrl.setEnvironment(SDKConstants.endpoint.production);
      }

      return new Promise((resolve) => {
        ctrl.execute(async function() {
          const apiResponse = ctrl.getResponse();
          const response = new ApiContracts.GetTransactionDetailsResponse(apiResponse);

          try {
            // If successful
            if (response.messages && response.messages.resultCode?.toLowerCase() === 'ok' && 
                response.messages.message?.[0]?.code?.toLowerCase() === 'i00001' && 
                response.transaction) {
              
              // Branch on transaction status — mirrors Mantle getTransactionDetails.js
              const status = response.transaction.transactionStatus?.toLowerCase() || '';
              const attendeeID = Number(response.transaction.order?.invoiceNumber?.split('-')[0]);

              if (
                ['capturedpendingsettlement', 'settledsuccessfully'].includes(status) &&
                !request.body?.forceUnconfirmed &&
                !request.body?.refund
              ) {
                // Captured / settled — write to MSSQL and sync MongoDB
                await updateTransaction(attendeeID, {
                  pi:      _.trim(transactionID),
                  ptk:     _.trim(response.transaction.order.invoiceNumber),
                  pdi:     new Date(response.transaction.submitTimeUTC),
                  pending: 0,
                  failed:  false
                }, vert);

              } else if (
                ['declined', 'expired', 'generalerror', 'voided', 'failedreview'].includes(status) &&
                !request.body?.forceUnconfirmed &&
                !request.body?.refund
              ) {
                // Failed / declined — record failure with reason
                await updateTransaction(attendeeID, {
                  py:      `authNet (${response.transaction.authAmount} failed)`,
                  pi:      _.trim(transactionID),
                  ptk:     _.trim(response.transaction.order.invoiceNumber),
                  pdi:     new Date(response.transaction.submitTimeUTC),
                  pending: 0,
                  piNew:   `${transactionID} ${response.transaction.responseReasonDescription}`,
                  failed:  true
                }, vert);

              } else if (
                (request.body?.payingnow || request.body?.forceUnconfirmed) &&
                response.transaction.order
              ) {
                // Unconfirmed (pay-now event) — alert registrant and host
                const attendeeObj = await _attendeeService.findAttendeeObj(0, attendeeID, 0, vert);
                const eventObj = await _eventService.getEventData({
                  headers: { vert },
                  pathParameters: { eventID: Number(attendeeObj.e) }
                });

                await sendUnconfirmedPaymentAlerts({
                  body: {
                    dataObj: {
                      eventname:        _.trim(attendeeObj.et),
                      processor:        'AuthNet',
                      eventcontactname: _.trim(eventObj.en),
                      hostEmail:        _.trim(eventObj.em),
                      attendeeID:       attendeeID,
                      attendeeFirst:    _.trim(attendeeObj.uf),
                      attendeeLast:     _.trim(attendeeObj.ul),
                      attendeeEmail:    _.trim(attendeeObj.ue),
                      amount:           Number(response.transaction.authAmount),
                      affDashboard:     `${DOMAINS_BY_VERTICAL[vert] || 'https://www.eventsquid.com'}/aff-dashboard.cfm?affiliate_id=${attendeeObj.a}`
                    }
                  }
                });
              }

              resolve(response);
            } else {
              resolve({
                apiResponse: apiResponse,
                response: response
              });
            }
          } catch (e) {
            console.error('ERROR in getTransactionDetails:', e);
            resolve(e);
          }
        });
      });
    } else {
      return { error: 'no credentials found' };
    }
  } catch (error) {
    console.error('Error getting transaction details:', error);
    throw error;
  }
}

/**
 * Pay by credit card
 */
export async function payByCreditCard(request) {
  try {
    if (!authNetLoaded) {
      await loadAuthorizeNet();
    }
    if (!ApiContracts || !ApiControllers) {
      throw new Error('authorizenet package not installed');
    }

    const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
    const affiliateID = request.body?.affiliateID;
    const credsRA = await getCredentials(affiliateID, vert);

    if (credsRA.length === 1 && _.trim(credsRA[0].login) !== '' && _.trim(credsRA[0].key) !== '') {
      // Create a 20-character refId
      const refID = `${request.body.c}-${moment().valueOf()}`;

      const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
      merchantAuthenticationType.setName(credsRA[0].login);
      merchantAuthenticationType.setTransactionKey(credsRA[0].key);

      const opaqueData = new ApiContracts.OpaqueDataType();
      opaqueData.setDataDescriptor(request.body.dataDescriptor);
      opaqueData.setDataValue(request.body.dataValue);

      const orderDetails = new ApiContracts.OrderType();
      orderDetails.setInvoiceNumber(refID);

      const paymentType = new ApiContracts.PaymentType();
      paymentType.setOpaqueData(opaqueData);

      const transactionRequestType = new ApiContracts.TransactionRequestType();
      transactionRequestType.setTransactionType(ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
      transactionRequestType.setPayment(paymentType);
      transactionRequestType.setAmount(Number(request.body.amount));
      transactionRequestType.setOrder(orderDetails);

      const createRequest = new ApiContracts.CreateTransactionRequest();
      createRequest.setMerchantAuthentication(merchantAuthenticationType);
      createRequest.setTransactionRequest(transactionRequestType);

      const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());

      // Set environment
      if (Number(credsRA[0].auth_sandbox) === 0 || !credsRA[0].auth_sandbox) {
        ctrl.setEnvironment(SDKConstants.endpoint.production);
      }

      return new Promise((resolve) => {
        ctrl.execute(async function() {
          const apiResponse = ctrl.getResponse();
          const response = new ApiContracts.CreateTransactionResponse(apiResponse);
          let returnObj = { status: 'how did we get here?' };

          // If successful and not multi-checkout
          if (response.messages && response.messages.resultCode?.toLowerCase() === 'ok' && 
              response.messages.message?.[0]?.code?.toLowerCase() === 'i00001' && 
              response.transactionResponse?.transId && !request.body.multiCheckout) {
            
          }

          // If we have a transaction response
          if (response.transactionResponse?.transId && Number(response.transactionResponse.transId) !== 0) {
            try {
              returnObj = await getTransactionDetails({
                headers: request.headers,
                pathParameters: {
                  affiliateID: String(affiliateID),
                  transactionID: String(response.transactionResponse.transId)
                },
                body: {
                  affiliateID: Number(affiliateID),
                  payingnow: true,
                  forceUnconfirmed: request.body.forceUnconfirmed
                }
              });
            } catch (e) {
              console.error('ERROR in payByCreditCard:', e);
              returnObj = e;
            }
          } else {
            resolve(response);
            return;
          }

          resolve(returnObj);
        });
      });
    } else {
      return { error: 'no credentials found' };
    }
  } catch (error) {
    console.error('Error processing credit card payment:', error);
    throw error;
  }
}

/**
 * Void a transaction that is pending settlement (cannot be refunded until settled).
 * Finds all attendees tied to the transaction and records a void against each one.
 */
export async function voidTransaction(affiliateID, transactionID, credsRA, transactionDetails, vert) {
  if (!authNetLoaded) await loadAuthorizeNet();
  if (!ApiContracts || !ApiControllers) throw new Error('authorizenet package not installed');

  const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
  merchantAuthenticationType.setName(credsRA[0].login);
  merchantAuthenticationType.setTransactionKey(credsRA[0].key);

  const transactionRequestType = new ApiContracts.TransactionRequestType();
  transactionRequestType.setTransactionType(ApiContracts.TransactionTypeEnum.VOIDTRANSACTION);
  transactionRequestType.setRefTransId(transactionDetails.transaction.transId);

  const createRequest = new ApiContracts.CreateTransactionRequest();
  createRequest.setMerchantAuthentication(merchantAuthenticationType);
  createRequest.setTransactionRequest(transactionRequestType);

  const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());
  if (Number(credsRA[0].auth_sandbox) === 0 || !credsRA[0].auth_sandbox) {
    ctrl.setEnvironment(SDKConstants.endpoint.production);
  }

  return new Promise((resolve) => {
    ctrl.execute(async function() {
      const apiResponse = ctrl.getResponse();
      const response = new ApiContracts.CreateTransactionResponse(apiResponse);

      try {
        if (response.messages && response.messages.resultCode?.toLowerCase() === 'ok' &&
            response.messages.message?.[0]?.code?.toLowerCase() === 'i00001' &&
            response.transactionResponse) {

          // Find all attendees tied to this transaction
          const sql = await getConnection(vert);
          const dbName = getDatabaseName(vert);
          const sqlRequest = new sql.Request();
          sqlRequest.input('processID', sql.VarChar, `%${_.trim(transactionID)}%`);
          sqlRequest.input('gateway',   sql.VarChar, '%authnet%');
          const qryResult = await sqlRequest.query(`
            USE ${dbName};
            EXEC dbo.node_transactionsByGatewayAndID @processID, @gateway;
          `);
          const attendees = qryResult.recordset || [];

          const rec = { body: {}, headers: { vert } };
          const voidSucceeded = Number(response.transactionResponse.responseCode) === 1;

          for (const attendee of attendees) {
            rec.body.amount = voidSucceeded ? 0 - Number(attendee.amount) : 0;
            rec.body.c   = Number(attendee.contestant_id);
            rec.body.pi  = _.trim(transactionID);
            rec.body.ptk = '';
            rec.body.rfi = _.trim(response.transactionResponse.transId);
            rec.body.rfn = voidSucceeded
              ? 'Void of unsettled transaction'
              : `Failed Void. ${_.trim(response.transactionResponse.messages?.[0]?.description || '')} (${response.transactionResponse.responseCode})`;
            await recordRefund(rec);
          }
        }

        resolve(response);
      } catch (e) {
        console.error('ERROR in voidTransaction:', e);
        resolve(e);
      }
    });
  });
}

/**
 * Refund transaction
 */
export async function refundTransaction(request) {
  try {
    if (!authNetLoaded) {
      await loadAuthorizeNet();
    }
    if (!ApiContracts || !ApiControllers) {
      throw new Error('authorizenet package not installed');
    }

    const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
    const affiliateID = request.pathParameters?.affiliateID;
    const contestantID = request.pathParameters?.contestantID;
    const transactionID = _.trim(_.last(_.split(request.pathParameters?.transactionID, ':')));
    const refundAmount = Number(request.pathParameters?.refundAmount);

    const credsRA = await getCredentials(affiliateID, vert);

    if (credsRA.length === 1 && _.trim(credsRA[0].login) !== '' && _.trim(credsRA[0].key) !== '') {
      // Get transaction details first
      const transactionDetails = await getTransactionDetails({
        headers: request.headers,
        pathParameters: { affiliateID, transactionID },
        body: { affiliateID, refund: true }
      });

      // If pending settlement, void instead of refund
      if (transactionDetails.transaction?.transactionStatus?.toLowerCase() === 'capturedpendingsettlement') {
        return await voidTransaction(affiliateID, transactionID, credsRA, transactionDetails, vert);
      }

      const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
      merchantAuthenticationType.setName(credsRA[0].login);
      merchantAuthenticationType.setTransactionKey(credsRA[0].key);

      const creditCard = new ApiContracts.CreditCardType();
      creditCard.setCardNumber(String(transactionDetails.transaction.payment.creditCard.cardNumber));
      creditCard.setExpirationDate(String(transactionDetails.transaction.payment.creditCard.expirationDate));

      const paymentType = new ApiContracts.PaymentType();
      paymentType.setCreditCard(creditCard);

      const duplicateWindowSetting = new ApiContracts.SettingType();
      duplicateWindowSetting.setSettingName('duplicateWindow');
      duplicateWindowSetting.setSettingValue('5');

      const transactionSettingList = [duplicateWindowSetting];
      const transactionSettings = new ApiContracts.ArrayOfSetting();
      transactionSettings.setSetting(transactionSettingList);

      const transactionRequestType = new ApiContracts.TransactionRequestType();
      transactionRequestType.setTransactionType(ApiContracts.TransactionTypeEnum.REFUNDTRANSACTION);
      transactionRequestType.setPayment(paymentType);
      transactionRequestType.setAmount(String(refundAmount));
      transactionRequestType.setRefTransId(String(transactionID));
      transactionRequestType.setTransactionSettings(transactionSettings);

      const createRequest = new ApiContracts.CreateTransactionRequest();
      createRequest.setMerchantAuthentication(merchantAuthenticationType);
      createRequest.setTransactionRequest(transactionRequestType);

      const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());

      // Set environment
      if (Number(credsRA[0].auth_sandbox) === 0 || !credsRA[0].auth_sandbox) {
        ctrl.setEnvironment(SDKConstants.endpoint.production);
      }

      return new Promise((resolve) => {
        ctrl.execute(async function() {
          const apiResponse = ctrl.getResponse();
          const response = new ApiContracts.CreateTransactionResponse(apiResponse);

          try {
            // If successful
            if (response.messages && response.messages.resultCode?.toLowerCase() === 'ok' &&
                response.messages.message?.[0]?.code?.toLowerCase() === 'i00001' &&
                response.transactionResponse) {

              const rec = { body: {}, headers: { vert } };
              rec.body.c   = Number(contestantID);
              rec.body.pi  = _.trim(transactionID);
              rec.body.ptk = '';
              rec.body.rfi = _.trim(response.transactionResponse.transId);

              if (Number(response.transactionResponse.responseCode) === 1) {
                // Successful refund — record negative amount
                rec.body.amount = 0 - refundAmount;
                rec.body.py     = 'authNet REFUND';
              } else {
                // Gateway declined the refund — record with zero amount and notes
                rec.body.amount = 0;
                rec.body.py     = 'authNet REFUND failed';
                rec.body.rfn    = `Failed Refund. ${_.trim(response.transactionResponse.messages?.[0]?.description || '')} (${response.transactionResponse.responseCode})`;
              }

              await recordRefund(rec);
            }

            resolve(response);
          } catch (e) {
            console.error('ERROR in refundTransaction:', e);
            resolve(e);
          }
        });
      });
    } else {
      return { error: 'no credentials found' };
    }
  } catch (error) {
    console.error('Error refunding transaction:', error);
    throw error;
  }
}

/**
 * Check multi-checkout
 */
export async function checkMultiCheckout(request) {
  try {
    const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
    const contestantID = request.pathParameters?.contestantID;

    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('contestantID', sql.Int, Number(contestantID));
    const result = await request.query(`
      USE ${dbName};
      SELECT multicheckout
      FROM eventContestant
      WHERE contestant_id = @contestantID
    `);
    const results = result.recordset;

    if (results && results.length > 0 && results[0].multicheckout) {
      return { multiCheckout: true, contestants: results[0].multicheckout };
    }

    return { multiCheckout: false };
  } catch (error) {
    console.error('Error checking multi-checkout:', error);
    throw error;
  }
}

/**
 * Get payment form (hosted payment page)
 */
export async function getPaymentForm(request) {
  try {
    if (!authNetLoaded) {
      await loadAuthorizeNet();
    }
    if (!ApiContracts || !ApiControllers) {
      throw new Error('authorizenet package not installed');
    }

    const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
    const affiliateID = request.pathParameters?.affiliateID;
    const contestantID = request.pathParameters?.contestantID;
    const login = request.pathParameters?.login;
    const key = request.pathParameters?.key;
    const payAmount = request.pathParameters?.payAmount;

    // Get gateway config from MongoDB
    const db = await getDatabase(null, vert);
    const gateways = db.collection('gateways');
    const gatewayConfig = await gateways.findOne({
      a: Number(affiliateID),
      pm: 'authnet',
      isDeleted: { $exists: false }
    });

    if (!gatewayConfig) {
      return { error: 'Gateway configuration not found' };
    }

    // Get event and contestant info
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const sqlRequest = new sql.Request();
    sqlRequest.input('contestantID', sql.Int, Number(contestantID));
    const result = await sqlRequest.query(`
      USE ${dbName};
      SELECT c.multicheckout, e.event_title
      FROM eventContestant c
      JOIN b_events e ON e.event_id = c.event_id
      WHERE contestant_id = @contestantID
    `);
    const invQuery = result.recordset;

    if (!invQuery || !invQuery.length) {
      return { error: 'Contestant not found' };
    }

    const invoiceDescription = (invQuery[0].multicheckout 
      ? `Multiple Attendee Registration: Attendee IDs (${invQuery[0].multicheckout}) for ${invQuery[0].event_title.replace('&', 'and')}`
      : `Attendee Registration: ${invQuery[0].event_title.replace('&', 'and')}`);

    const orderDetails = new ApiContracts.OrderType();
    orderDetails.setInvoiceNumber(contestantID);
    orderDetails.setDescription(invoiceDescription);

    const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(login);
    merchantAuthenticationType.setTransactionKey(key);

    const transactionRequestType = new ApiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
    transactionRequestType.setAmount(payAmount);
    transactionRequestType.setOrder(orderDetails);

    const settingList = [];

    let paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentButtonOptions');
    paymentSetting.setSettingValue('{"text": "Pay"}');
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentOrderOptions');
    paymentSetting.setSettingValue('{"show": true}');
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentShippingAddressOptions');
    paymentSetting.setSettingValue(`{"show": ${Boolean(gatewayConfig.auth_shipAddressAsk)}, "required": ${Boolean(gatewayConfig.auth_shipAddressReq)}}`);
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentBillingAddressOptions');
    paymentSetting.setSettingValue(`{"show": ${Boolean(gatewayConfig.auth_billAddressAsk)}, "required": ${Boolean(gatewayConfig.auth_billAddressReq)}}`);
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentCustomerOptions');
    paymentSetting.setSettingValue(`{"showEmail": ${Boolean(gatewayConfig.auth_emailAddressAsk)}, "requiredEmail": ${Boolean(gatewayConfig.auth_emailAddressReq)}}`);
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentPaymentOptions');
    paymentSetting.setSettingValue(`{"cardCodeRequired": ${Boolean(gatewayConfig.auth_cardCode)}, "showCreditCard": true, "showBankAccount": ${Boolean(gatewayConfig.auth_bankAccount)}}`);
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentSecurityOptions');
    paymentSetting.setSettingValue(`{"captcha": ${Boolean(gatewayConfig.auth_captcha)}}`);
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentIFrameCommunicatorUrl');
    paymentSetting.setSettingValue(`{"url": "${request.headers.origin || ''}/authnetCommunicator.cfm"}`);
    settingList.push(paymentSetting);

    paymentSetting = new ApiContracts.SettingType();
    paymentSetting.setSettingName('hostedPaymentReturnOptions');
    paymentSetting.setSettingValue('{"showReceipt": false}');
    settingList.push(paymentSetting);

    const alist = new ApiContracts.ArrayOfSetting();
    alist.setSetting(settingList);

    const getRequest = new ApiContracts.GetHostedPaymentPageRequest();
    getRequest.setMerchantAuthentication(merchantAuthenticationType);
    getRequest.setTransactionRequest(transactionRequestType);
    getRequest.setHostedPaymentSettings(alist);

    const ctrl = new ApiControllers.GetHostedPaymentPageController(getRequest.getJSON());

    if (Number(gatewayConfig.auth_sandbox) === 0) {
      ctrl.setEnvironment(SDKConstants.endpoint.production);
    }

    return new Promise((resolve, reject) => {
      ctrl.execute(function() {
        const apiResponse = ctrl.getResponse();
        const response = new ApiContracts.GetHostedPaymentPageResponse(apiResponse);

        if (response != null) {
          if (response.getMessages().getResultCode() == ApiContracts.MessageTypeEnum.OK) {
            resolve({ token: response.getToken(), form: response });
          } else {
            console.error('Error Code:', response.getMessages().getMessage()[0].getCode());
            console.error('Error message:', response.getMessages().getMessage()[0].getText());
            reject(response);
          }
        } else {
          reject(response);
        }
      });
    });
  } catch (error) {
    console.error('Error getting payment form:', error);
    throw error;
  }
}

