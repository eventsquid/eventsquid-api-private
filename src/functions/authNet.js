/**
 * Authorize.Net functions
 * Migrated from Mantle functions/auth-net
 * 
 * NOTE: Requires 'authorizenet' package - add to package.json:
 * "authorizenet": "^1.0.6"
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { getDatabase } from '../utils/mongodb.js';
import _ from 'lodash';
import moment from 'moment-timezone';

// Import authorizenet SDK (will need to be installed)
// NOTE: This is a dynamic import that will fail if package is not installed
// The functions will handle this gracefully
let ApiContracts, ApiControllers, SDKConstants;

async function loadAuthorizeNet() {
  try {
    const authorizenet = await import('authorizenet');
    ApiContracts = authorizenet.APIContracts;
    ApiControllers = authorizenet.APIControllers;
    SDKConstants = authorizenet.Constants;
    return true;
  } catch (error) {
    console.warn('authorizenet package not installed - AuthNet functions will not work');
    return false;
  }
}

// Load on module initialization
let authNetLoaded = false;
loadAuthorizeNet().then(loaded => { authNetLoaded = loaded; });

/**
 * Get credentials by affiliate ID
 */
export async function getCredentials(affiliateID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_authNetCredsByAffiliate @affiliateID
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

    return results || [];
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_authNetCredsByAttendee @attendeeID
    `)
    .parameter('attendeeID', TYPES.Int, Number(attendeeID))
    .execute();

    return results || [];
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
              
              // TODO: Implement transaction status handling and updates
              // This would involve calling updateTransaction, sendUnconfirmedPaymentAlerts, etc.
              // For now, just return the response
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
            
            // TODO: Implement transaction recording and attendee status updates
            // This would involve calling:
            // - recordTransaction(request)
            // - updateFinancialsMongo(request.body.c, vert)
            // - updateAttendeeRegStatus(request)
            console.log('Transaction successful - recording pending implementation');
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
        // TODO: Implement voidTransaction
        return { error: 'Transaction is pending settlement - void required (not implemented)' };
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
              
              // TODO: Implement recordRefund
              // This would involve calling recordRefund(request) with appropriate data
              console.log('Refund successful - recording pending implementation');
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

    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
      USE ${dbName};
      SELECT multicheckout
      FROM eventContestant
      WHERE contestant_id = @contestantID
    `)
    .parameter('contestantID', TYPES.Int, Number(contestantID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const invQuery = await connection.sql(`
      USE ${dbName};
      SELECT c.multicheckout, e.event_title
      FROM eventContestant c
      JOIN b_events e ON e.event_id = c.event_id
      WHERE contestant_id = @contestantID
    `)
    .parameter('contestantID', TYPES.Int, Number(contestantID))
    .execute();

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
            console.log('Hosted payment page token:', response.getToken());
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

