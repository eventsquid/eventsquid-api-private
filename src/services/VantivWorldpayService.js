/**
 * Vantiv/Worldpay Service
 * Migrated from services/VantivWorldpayService.js
 */

import { toXML } from 'jstoxml';
import { xml2js } from 'xml-js';
import axios from 'axios';
import _ from 'lodash';
import { getConnection, getDatabaseName } from '../utils/mssql.js';
import { TYPES } from 'mssql';
import { recordRefund } from '../functions/paymentTransactions/recordRefund.js';

const VANTIV_ENDPOINT = 'https://certtransaction.elementexpress.com/';

async function getCredentials(affiliateID, vert) {
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);
  const sqlRequest = new sql.Request();
  sqlRequest.input('affID', TYPES.Int, Number(affiliateID));
  const result = await sqlRequest.query(`
    USE ${dbName};
    SELECT
      vwAccountToken AS accountToken,
      vwAcceptorID   AS acceptorID,
      vwAccountID    AS accountID,
      vwApplicationID AS applicationID
    FROM affiliateMerchant
    WHERE affiliate_id = @affID
  `);
  const creds = _.first(result.recordset);
  if (!creds) throw new Error(`No Vantiv/Worldpay credentials found for affiliateID ${affiliateID}`);
  return creds;
}

async function postXML(xmlStr) {
  const response = await axios.request({
    url: VANTIV_ENDPOINT,
    method: 'post',
    headers: { 'content-type': 'text/xml' },
    data: xmlStr
  });
  return response.data;
}

class VantivWorldpayService {
  /**
   * Set up a hosted payment transaction — returns a transactionSetupID used to render
   * the Vantiv hosted payment iframe.
   */
  async transactionSetup(request) {
    const {
      affiliateID,
      transactionAmount,
      returnURL,
      referenceNumber,
      ticketNumber,
      esTID,
      eventID
    } = request.body || {};
    const vert = request.headers?.vert || '';

    const { accountToken, acceptorID, accountID, applicationID } = await getCredentials(affiliateID, vert);

    const xmlStr = toXML({
      TransactionSetup: {
        _attrs: { xmlns: 'https://transaction.elementexpress.com' },
        Credentials: {
          AccountID: accountID,
          AccountToken: accountToken,
          AcceptorID: acceptorID
        },
        Application: {
          ApplicationID: applicationID,
          ApplicationVersion: '1.0',
          ApplicationName: 'HostedPayments.CSharp'
        },
        Terminal: {
          TerminalID: '01',
          CardholderPresentCode: '2',
          CardInputCode: '4',
          TerminalCapabilityCode: '3',
          TerminalEnvironmentCode: '2',
          CardPresentCode: '2',
          MotoECICode: '1',
          CVVPresenceCode: '1'
        },
        Transaction: {
          TransactionAmount: transactionAmount,
          ReferenceNumber: referenceNumber,
          TicketNumber: ticketNumber,
          MerchantSuppliedTransactionID: esTID
        },
        TransactionSetup: {
          TransactionSetupMethod: '1',
          Embedded: '1',
          AutoReturn: '1',
          ReturnURL: returnURL,
          CustomCss: ''
        }
      }
    });

    const responseXML = await postXML(xmlStr);
    const returnJSON = xml2js(responseXML, { compact: true, trim: true });
    return {
      transactionSetupID: returnJSON.TransactionSetupResponse.Response.TransactionSetup.TransactionSetupID._text
    };
  }

  /**
   * Issue a credit card return (refund) against a prior Vantiv/Worldpay transaction.
   * Records the result via recordRefund regardless of gateway outcome.
   */
  async creditCardReturn(request) {
    const { contestantID, affiliateID, transactionID, refundAmount } = request.pathParameters || {};
    const vert = request.headers?.vert || '';

    const { accountToken, acceptorID, accountID, applicationID } = await getCredentials(affiliateID, vert);

    const xmlStr = toXML({
      CreditCardReturn: {
        _attrs: { xmlns: 'https://transaction.elementexpress.com' },
        Credentials: {
          AccountID: accountID,
          AccountToken: accountToken,
          AcceptorID: acceptorID
        },
        Application: {
          ApplicationID: applicationID,
          ApplicationVersion: '1.0',
          ApplicationName: 'Express.CSharp'
        },
        Terminal: {
          TerminalID: '01',
          CardholderPresentCode: '2',
          CardInputCode: '5',
          TerminalCapabilityCode: '3',
          TerminalEnvironmentCode: '2',
          CardPresentCode: '2',
          MotoECICode: '1',
          CVVPresenceCode: '1'
        },
        Transaction: {
          TransactionAmount: refundAmount,
          TransactionID: transactionID,
          MarketCode: '7'
        }
      }
    });

    const responseXML = await postXML(xmlStr);
    const returnJSON = xml2js(responseXML, { compact: true, trim: true });

    const ccReturnResponse = {
      response: {
        code: Number(returnJSON.CreditCardReturnResponse.Response.ExpressResponseCode._text),
        msg: _.trim(returnJSON.CreditCardReturnResponse.Response.ExpressResponseMessage._text)
      },
      transactionID: _.trim(returnJSON.CreditCardReturnResponse.Response.Transaction.TransactionID._text)
    };

    const refundRequest = {
      body: {
        c:   Number(contestantID),
        pi:  _.trim(transactionID),
        ptk: ''
      },
      headers: { vert }
    };

    if (ccReturnResponse.response.code === 0 && ccReturnResponse.response.msg.toLowerCase() === 'approved') {
      refundRequest.body.amount = 0 - Number(refundAmount);
      refundRequest.body.py  = 'vantiv-worldpay REFUND';
      refundRequest.body.rfi = _.trim(ccReturnResponse.transactionID);
    } else {
      refundRequest.body.amount = 0;
      refundRequest.body.py  = 'vantiv-worldpay REFUND failed';
      refundRequest.body.rfi = _.trim(ccReturnResponse.transactionID);
      refundRequest.body.rfn = `Failed Refund. ${_.trim(ccReturnResponse.response.msg)} (${ccReturnResponse.response.code})`;
    }

    await recordRefund(refundRequest);

    return ccReturnResponse;
  }
}

export default VantivWorldpayService;
