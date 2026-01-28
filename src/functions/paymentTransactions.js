/**
 * Payment transaction functions
 * Migrated from Mantle functions/paymentTransactions
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _ from 'lodash';
import sgMail from '@sendgrid/mail';

/**
 * Find transaction by gateway and ID
 */
export async function findByGatewayAndID(request) {
  try {
    const { gateway, transactionID } = request.pathParameters || {};
    const vert = request.headers?.vert || request.vert || '';
    const affiliateID = request.session?.affiliate_id || 0;

    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Query using stored procedure
    const sqlRequest = new sql.Request();
    sqlRequest.input('processID', sql.VarChar, `%${_.trim(transactionID)}%`);
    sqlRequest.input('gateway', sql.VarChar, `%${_.trim(gateway)}%`);
    const result = await sqlRequest.query(`
      USE ${dbName};
      EXEC dbo.node_transactionsByGatewayAndID @processID, @gateway
    `);
    const qryRA = result.recordset;

    let transactionDetails = {};
    let transaction = {};

    // If this is an authnet transaction, get additional details
    // Note: AuthNet integration would need to be implemented separately
    if (_.trim(gateway) === 'authnet' && qryRA.length > 0) {
      // TODO: Implement AuthNet getTransactionDetails if needed
      // For now, just return the basic transaction data
      transaction = {
        status: 'pending',
        amount: 0,
        amountAuthorized: 0
      };
    }

    return {
      transaction: transaction,
      contestants: qryRA
    };
  } catch (error) {
    console.error('Error finding transaction by gateway and ID:', error);
    throw error;
  }
}

/**
 * Send unconfirmed payment alerts
 */
export async function sendUnconfirmedPaymentAlerts(request) {
  try {
    const sgKey = process.env.SENDGRID_API_KEY;
    if (!sgKey) {
      throw new Error('SENDGRID_API_KEY not configured');
    }

    sgMail.setApiKey(sgKey);

    const dataObj = request.body?.dataObj || {};
    const sgSender = process.env.SENDGRID_SENDER || 'noreply@eventsquid.com';

    const attendeeMsg = `
      <p>${dataObj.attendeeFirst},</p>
      
      <p>We completed your registration for ${dataObj.eventname} however we did not receive confirmation of payment from the payment processor.</p>
      
      <p>If you DID NOT successfully complete payment, please click on the PAY NOW or View Invoice link in your confirmation email to complete payment.</p>
      
      <p>If you DID successfully pay, please locate one of these forms of confirmation of payment:<br>
      
      - An email receipt from the payment processor ${dataObj.processor}<br>
      - A screenshot of the processed payment from your credit card or bank account</p>
      
      <p>You can send that information to the event host:<br>
      
      ${dataObj.eventcontactname}<br>
      ${dataObj.hostEmail}</p>
      
      
      <p>If you need further assistance, please email Eventsquid support at support@eventsquid.com</p>
      
      <p>Thank You,<br>
      Your Eventsquid Event Monitor</p>
    `;

    const hostMsg = `
      <p>Event Administrator:</p>
      
      <p>One of your registrants attempted to pay for their registration but our system hasn't received a response from your payment processor, ${dataObj.processor}.</p>
      
      <p>Our system completed the registration but you need to take further ACTION TO CONFIRM PAYMENT.</p>
      
      
      <p>Registration Information<br>
      
      Registration ID: ${dataObj.attendeeID}<br>
      Registrant First Name: ${dataObj.attendeeFirst}<br>
      Registrant Last Name: ${dataObj.attendeeLast}<br>
      Registration email: ${dataObj.attendeeEmail}<br>
      Total Amount Due: ${dataObj.amount}</p>
      
      
      <p>1. Sign into your ${dataObj.processor} account and find the transaction attempt.<br>
      
      2. Be sure to examine all transaction attempts as you may see both a Failed and Succeeded record for a single registration (it typically means the transaction failed the first attempt then succeeded on a subsequent attempt).</p>
      
      
      <p>IF THE TRANSACTION WAS SUCCESSFUL</p>
      
      <p>If you find that ${dataObj.processor} did indeed process the payment you will want to record the payment in Eventsquid and send an updated confirmation email.<br>
      
      1. Copy the transaction ID from the ${dataObj.processor} record <br>
      2. Go to your event dashboard on Eventsquid ${dataObj.affDashboard}<br>
      3. Click on ${dataObj.eventname} and click REGISTERED ATTENDEES<br>
      4. Search for the registration and click on the registrant name to open the registrant details panel.<br>
      5. Click Adjust Account atop the registrant details panel<br>
      6. Under "Make Adjustments" choose Make a Payment and select Offline Credit Card payment<br>
      7. In the "Trans ID or Notes" field paste or enter the transaction ID from ${dataObj.processor} along with any other note you wish.<br>
      8. Click APPLY ADJUSTMENT<br>
      9. Atop the registration details panel, click "Resend Notices" to send an updated confirmation email.</p>
      
      
      <p>IF THE TRANSACTION FAILED</p>
      
      <p>If you find that ${dataObj.processor} did not process the payment you will want to contact the registrant.<br>
      
      1. Go to your event dashboard on Eventsquid ${dataObj.affDashboard}<br>
      2. Click on ${dataObj.eventname} and click REGISTERED ATTENDEES<br>
      3. Search for the registration and click on the registrant name to open the registrant details panel.<br>
      4. Click on the Personal Profile tab on the left to get the registrant's contact information. Alternatively, you can use the Quick Email tab to sent an email to the registrant.  You will want to let the registrant know that their payment didn't go through.<br>
      5. You can click Resend Notices atop the registration details panel and the registrant will receive a confirmation notice with a Pay Balance Due link.<br>
      6. Alternatively, you can click the red x to the left of the registrant's name on your dashboard and tell the registrant to "try again".  This will remove the registrant from your event (but the system will remember the selections they made so they can easily complete their registration)</p>
      
      <p>If you need further assistance, please email Eventsquid support at support@eventsquid.com</p>
      
      
      <p>Your Eventsquid Event Monitor</p>
    `;

    const attendeePayload = {
      to: dataObj.attendeeEmail,
      from: sgSender,
      subject: `Payment for ${dataObj.eventname} Not Confirmed`,
      text: attendeeMsg.replace(/[\t]/g, ''),
      html: attendeeMsg.replace(/[\t]/g, '')
    };

    const hostPayload = {
      to: dataObj.hostEmail,
      from: sgSender,
      subject: `Payment Issue With Registration for ${dataObj.eventname}`,
      text: hostMsg.replace(/[\t]/g, ''),
      html: hostMsg.replace(/[\t]/g, '')
    };

    await sgMail.send(attendeePayload);
    await sgMail.send(hostPayload);

    return { status: 'success' };
  } catch (error) {
    console.error('Error sending unconfirmed payment alerts:', error);
    return { status: 'failed', error: error.message };
  }
}

/**
 * Get pending transactions
 */
export async function getPending(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID || 0));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getPendingTransactions @affiliateID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting pending transactions:', error);
    throw error;
  }
}

/**
 * Update pending transactions
 */
export async function updatePending(affiliateID, vert, validationkey) {
  try {
    // Validate secret key
    const VALIDATION_KEY = '68bcd1af-d095-4a63-8013-dec6e0cdf90c';
    if (!validationkey || validationkey !== VALIDATION_KEY) {
      return { status: 'completed' };
    }

    // Get pending transactions
    const transRA = await getPending(affiliateID, vert);

    // Import AuthNet function
    const { getTransactionDetails } = await import('../functions/authNet.js');

    // Loop through transactions and update them
    for (let i = 0; i < transRA.length; i++) {
      // Build request object for getTransactionDetails
      const reqObj = {
        pathParameters: {
          affiliateID: Number(transRA[i].a),
          transactionID: String(transRA[i].pi)
        },
        headers: {
          vert: String(vert)
        },
        body: {
          affiliateID: Number(transRA[i].a)
        }
      };

      // If this is an authnet transaction, update it
      if (transRA[i].py && transRA[i].py.toLowerCase() === 'authnet') {
        await getTransactionDetails(reqObj);
      }
    }

    return { status: `Processed ${transRA.length} Records` };
  } catch (error) {
    console.error('Error updating pending transactions:', error);
    throw error;
  }
}

