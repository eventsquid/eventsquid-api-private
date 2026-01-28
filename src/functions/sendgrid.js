/**
 * SendGrid functions
 * Migrated from Mantle functions/sendgrid
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _ from 'lodash';
import moment from 'moment-timezone';
import axios from 'axios';
import sgMail from '@sendgrid/mail';
import { generateVerifyCode } from './verification.js';

/**
 * Log email (SendGrid webhook)
 */
export async function logEmail(form) {
  try {
    // Email logs are stored in "cm" vertical
    const db = await getDatabase(null, 'cm');
    const mailLogs = db.collection('mail-logs');

    const inboundAPIKey = process.env.TWILIO_INBOUND_API_KEY || process.env.SENDGRID_INBOUND_API_KEY;

    // Filter the array down to those that include the eventsquid API key (_esk),
    // AND the eventsquid tracking indicator (_est - without this we won't track the email)
    const sendgridRA = Array.isArray(form) 
      ? _.filter(form, { '_esk': inboundAPIKey, '_est': 1 })
      : [];

    const messageIDs = {};
    let thisMsgID = '';
    let thisActObj = {};
    let thisStatus = '';

    // Loop the records
    for (let i = 0; i < sendgridRA.length; i++) {
      thisMsgID = 'ES:' + _.trim(sendgridRA[i].sg_message_id);
      const ccRA = sendgridRA[i].to_cc || [];

      // Actor (admin who made changes)
      let actor = {};
      let uf = '';
      let ul = '';

      // If we have an admin level set, we have actor information
      if (typeof sendgridRA[i].alev !== 'undefined') {
        actor = {
          u: Number(sendgridRA[i].au || 0),
          uf: String(sendgridRA[i].auf || ''),
          ul: String(sendgridRA[i].aul || ''),
          ue: String(sendgridRA[i].aue || ''),
          aul: Number(sendgridRA[i].alev || 0)
        };
      }

      if (typeof sendgridRA[i].uf !== 'undefined') {
        uf = String(sendgridRA[i].uf || '');
        ul = String(sendgridRA[i].ul || '');
      }

      // If cc is not an array, convert it
      const ccArray = _.isArray(ccRA) ? ccRA : (ccRA ? ccRA.split(',') : []);

      // If we don't yet have an object for this record
      if (!messageIDs[thisMsgID]) {
        // Create it
        messageIDs[thisMsgID] = {
          setOnInsertObj: {
            _id: String(thisMsgID),
            ue: String(sendgridRA[i].email || ''),
            uf: String(uf),
            ul: String(ul),
            fma: Number(sendgridRA[i].from_a || 0),
            fme: Number(sendgridRA[i].from_e || 0),
            fmu: Number(sendgridRA[i].from_u || 0),
            toc: Number(sendgridRA[i].to_c || 0),
            tou: Number(sendgridRA[i].to_u || 0),
            f3: String(sendgridRA[i].f3 || ''),
            tge: Number(sendgridRA[i].tgt_e || 0),
            srv: Number(sendgridRA[i].srv_id || 0),
            eti: Number(sendgridRA[i].emailTemplateID || 0),
            mi: Number(sendgridRA[i].mailID || 0),
            cat: typeof sendgridRA[i].cat === 'undefined' ? '' : String(sendgridRA[i].cat),
            acr: actor,
            utp: String(sendgridRA[i].type || ''),
            s: String(sendgridRA[i].s || ''),
            sub: String(sendgridRA[i].subject || ''),
            smi: String(sendgridRA[i]['smtp-id'] || ''),
            tcc: _.concat([], ccArray),
            avy: []
          },
          activityRA: []
        };

        // If the cc array is empty, remove it
        if (_.isEmpty(messageIDs[thisMsgID].setOnInsertObj.tcc)) {
          delete messageIDs[thisMsgID].setOnInsertObj.tcc;
        }

        // Remove any IDs set to zero
        if (messageIDs[thisMsgID].setOnInsertObj.fma === 0) delete messageIDs[thisMsgID].setOnInsertObj.fma;
        if (messageIDs[thisMsgID].setOnInsertObj.fme === 0) delete messageIDs[thisMsgID].setOnInsertObj.fme;
        if (messageIDs[thisMsgID].setOnInsertObj.fmu === 0) delete messageIDs[thisMsgID].setOnInsertObj.fmu;
        if (messageIDs[thisMsgID].setOnInsertObj.toc === 0) delete messageIDs[thisMsgID].setOnInsertObj.toc;
        if (messageIDs[thisMsgID].setOnInsertObj.tou === 0) delete messageIDs[thisMsgID].setOnInsertObj.tou;
        if (messageIDs[thisMsgID].setOnInsertObj.tge === 0) delete messageIDs[thisMsgID].setOnInsertObj.tge;
        if (messageIDs[thisMsgID].setOnInsertObj.srv === 0) delete messageIDs[thisMsgID].setOnInsertObj.srv;
        if (messageIDs[thisMsgID].setOnInsertObj.mi === 0) delete messageIDs[thisMsgID].setOnInsertObj.mi;
        if (messageIDs[thisMsgID].setOnInsertObj.eti === 0) delete messageIDs[thisMsgID].setOnInsertObj.eti;
        if (messageIDs[thisMsgID].setOnInsertObj.cat === '') delete messageIDs[thisMsgID].setOnInsertObj.cat;
        if (messageIDs[thisMsgID].setOnInsertObj.utp === '') delete messageIDs[thisMsgID].setOnInsertObj.utp;
      }

      // If we have an events array, this must be an import from the sendgrid API
      if (sendgridRA[i].events) {
        messageIDs[thisMsgID].activityRA = sendgridRA[i].events;
      } else {
        thisActObj = {
          act: _.trim(sendgridRA[i].event || ''),
          ssc: _.trim(sendgridRA[i].status || ''),
          rsp: _.trim(sendgridRA[i].response || ''),
          id: _.trim(sendgridRA[i].sg_event_id || ''),
          tsp: moment.utc(sendgridRA[i].timestamp).format(),
          // Delivered always takes precedent when there are shared timestamps
          _x: (_.trim(sendgridRA[i].event) === 'delivered') ? 99 : 0
        };

        // Remove any missing data points
        if (thisActObj.rsp === '') delete thisActObj.rsp;
        if (thisActObj.ssc === '') delete thisActObj.ssc;

        // Update the message activity
        messageIDs[thisMsgID].activityRA.push(thisActObj);
      }
    }

    // Loop and upsert each record
    for (const msgID in messageIDs) {
      // Set the latest status based on the most recent event
      thisStatus = _.last(_.sortBy(messageIDs[msgID].activityRA, ['tsp', '_x']));
      thisStatus = _.trim(thisStatus?.act || '');

      // Upsert this document
      await mailLogs.updateOne(
        { _id: String(msgID) },
        {
          $set: { ss: String(thisStatus) },
          $setOnInsert: messageIDs[msgID].setOnInsertObj
        },
        { upsert: true }
      );

      // Update the document with activity
      await mailLogs.updateOne(
        { _id: String(msgID) },
        {
          $currentDate: { lu: { $type: 'date' } },
          $addToSet: { avy: { $each: messageIDs[msgID].activityRA } }
        }
      );
    }

    return true;
  } catch (error) {
    console.error('Error logging email:', error);
    throw error;
  }
}

/**
 * Validate email address
 */
export async function validateEmail(form) {
  try {
    const sgEmailValKey = process.env.SG_EMAIL_VAL_KEY;
    
    if (!sgEmailValKey) {
      // OLD CODE BEHAVIOR: In local dev, return mock validation result when API key is missing
      console.warn('SG_EMAIL_VAL_KEY not set, returning mock validation result for local dev');
      // Return a mock validation result that matches SendGrid's response format
      return {
        email: form.email || '',
        verdict: 'Valid',
        score: 0.95,
        local: form.email?.split('@')[0] || '',
        host: form.email?.split('@')[1] || '',
        suggestion: '',
        checks: {
          domain: { has_valid_address_syntax: true, has_mx_records: true, has_cname_records: false },
          local_part: { is_suspected_role_address: false, is_suspected_disposable_address: false, is_suspected_free_address: false },
          additional: { has_known_bounces: false, has_suspected_bounces: false }
        },
        source: form.source || ''
      };
    }

    const response = await axios.request({
      url: 'https://api.sendgrid.com/v3/validations/email',
      method: 'post',
      headers: {
        'authorization': `Bearer ${sgEmailValKey}`,
        'content-type': 'application/json'
      },
      data: JSON.stringify(form)
    });

    return response.data.result;
  } catch (error) {
    console.error('Error validating email:', error);
    throw error;
  }
}

/**
 * Verify email address has eventsquid account
 */
export async function verifyEmail(request) {
  try {
    const email = request.body?.email;
    const vert = request.headers?.vert || request.vert || '';

    if (!email) {
      return { email: '', hasAccount: false };
    }

    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('userEmail', sql.VarChar, String(email));
    const result = await request.query(`
      USE ${dbName};
      SELECT user_id
      FROM b_users
      WHERE user_email = @userEmail
    `);
    const results = result.recordset;

    const hasAccount = results.length > 0 && results[0].user_id;

    return {
      email: email,
      hasAccount: Boolean(hasAccount)
    };
  } catch (error) {
    console.error('Error verifying email:', error);
    throw error;
  }
}

/**
 * Get user phone
 */
export async function getUserPhone(request) {
  try {
    const email = request.params?.email || request.body?.email;
    const vert = request.headers?.vert || request.vert || '';

    if (!email) {
      return { email: '', phone: '' };
    }

    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('userEmail', sql.VarChar, String(email));
    const result = await request.query(`
      USE ${dbName};
      SELECT user_mobile, user_phone
      FROM b_users
      WHERE user_email = @userEmail
    `);
    const results = result.recordset;

    let phoneNumber = '';
    if (results.length > 0) {
      phoneNumber = results[0].user_mobile || results[0].user_phone || '';
    }

    return {
      email: email,
      phone: phoneNumber
    };
  } catch (error) {
    console.error('Error getting user phone:', error);
    throw error;
  }
}

/**
 * Send email via SendGrid
 */
export async function sendEmail(form) {
  try {
    const sgKey = process.env.SG_API_KEY;
    if (!sgKey) {
      // OLD CODE BEHAVIOR: In local dev, log and return true when API key is missing (mock sending)
      console.warn('SG_API_KEY not set, mocking email send for local dev');
      console.log('Would send email:', {
        to: form.to,
        subject: form.subject,
        from: form.fromName || process.env.SENDGRID_SENDER || 'noreply@eventsquid.com'
      });
      return true;
    }

    sgMail.setApiKey(sgKey);

    if (!('html' in form) && !('text' in form)) {
      throw new Error('No body provided for email');
    }

    if (!('to' in form)) {
      throw new Error('No recipient specified for email');
    }

    if (!('subject' in form)) {
      throw new Error('No subject specified for email');
    }

    const sgSender = process.env.SENDGRID_SENDER || 'noreply@eventsquid.com';
    let from = sgSender;
    
    if ('fromName' in form) {
      from = {
        email: sgSender,
        name: form.fromName
      };
    }

    const payload = {
      from,
      to: form.to,
      subject: form.subject,
      ...(form.html && { html: form.html }),
      ...(form.text && { text: form.text }),
      ...(form.reply_to && { replyTo: form.reply_to })
    };

    console.log('Attempting to send email via SendGrid:', {
      to: form.to,
      subject: form.subject,
      from: from,
      hasHtml: !!form.html,
      hasText: !!form.text
    });

    const result = await sgMail.send(payload);
    
    console.log('SendGrid API response:', {
      statusCode: result[0]?.statusCode,
      headers: result[0]?.headers,
      body: result[0]?.body
    });

    if (result[0]?.statusCode >= 200 && result[0]?.statusCode < 300) {
      console.log('Email sent successfully via SendGrid:', {
        to: form.to,
        subject: form.subject,
        statusCode: result[0]?.statusCode
      });
      return true;
    } else {
      console.warn('SendGrid returned non-success status:', result[0]?.statusCode);
      return false;
    }
  } catch (error) {
    console.error('Error sending email:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      statusCode: error.response?.statusCode
    });
    return false;
  }
}

/**
 * Send verification code
 */
export async function sendVerificationCode(form) {
  try {
    // Generate Verification Code and add token to database
    const code = await generateVerifyCode(form.email);

    // Send email
    const emailSent = await sendEmail({
      to: form.email,
      fromName: 'Eventsquid Security Team',
      reply_to: 'support@eventsquid.com',
      subject: 'Verification Code for Eventsquid',
      html: `
        <div>
          <p>Your verification code is <strong>${code}</strong></p>
          <p>This passcode expires in 15 minutes</p>
          <p>Eventsquid</p>
        </div>
      `
    });

    if (emailSent) {
      return { success: true, data: 'Email Sent' };
    } else {
      return { success: false, data: 'Email Not Sent' };
    }
  } catch (error) {
    console.error('Error sending verification code:', error);
    return { success: false, data: 'Email Not Sent' };
  }
}

/**
 * Get email detail from API (helper function)
 */
export async function getEmailDetailFromAPI(msgID, vert) {
  try {
    const sendgridAPIURL = `https://api.sendgrid.com/v3/messages/${msgID}`;
    const sgEmailActivityKey = process.env.SG_EMAIL_ACTIVITY_KEY;

    if (!sgEmailActivityKey) {
      throw new Error('SG_EMAIL_ACTIVITY_KEY environment variable is required');
    }

    const response = await axios.request({
      url: sendgridAPIURL,
      method: 'get',
      headers: {
        'authorization': `Bearer ${sgEmailActivityKey}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error getting email detail from API:', error);
    // Return error object instead of throwing to match old behavior
    return error;
  }
}

/**
 * Get email list from API
 */
export async function getEmailListFromAPI(form, vert) {
  try {
    const inboundAPIKey = process.env.TWILIO_INBOUND_API_KEY || process.env.SENDGRID_INBOUND_API_KEY;
    const sgEmailActivityKey = process.env.SG_EMAIL_ACTIVITY_KEY;

    if (!sgEmailActivityKey) {
      throw new Error('SG_EMAIL_ACTIVITY_KEY environment variable is required');
    }

    if (!inboundAPIKey) {
      throw new Error('TWILIO_INBOUND_API_KEY or SENDGRID_INBOUND_API_KEY environment variable is required');
    }

    let sendgridAPIURL = `https://api.sendgrid.com/v3/messages?limit=999&query=`;
    let qryParams = `(unique_args["s"]="${vert}") AND (unique_args["_esk"]="${inboundAPIKey}")`;

    // If we have a date range
    if (form.fromTS && form.toTS) {
      // TS (timestamp) strings must be in this format: "2020-09-03T00:00:00.000Z"
      qryParams += ` AND last_event_time BETWEEN TIMESTAMP "${form.fromTS}" AND TIMESTAMP "${form.toTS}"`;
    }

    // If we have a mailID
    if (form.mailID) {
      qryParams += ` AND (unique_args["mailID"]="${form.mailID}")`;
    }

    // If we have any query params
    if (qryParams.length > 0) {
      sendgridAPIURL += encodeURI(qryParams);
    }

    const response = await axios.request({
      url: sendgridAPIURL,
      method: 'get',
      headers: {
        'authorization': `Bearer ${sgEmailActivityKey}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error getting email list from API:', error);
    // Return error object instead of throwing to match old behavior
    return error;
  }
}

/**
 * Import email detail from API
 * Rate-limited to one request every 3 seconds to respect SendGrid API limits
 */
export async function importEmailDetailFromAPI(msgIDRA, vert) {
  try {
    if (!Array.isArray(msgIDRA) || msgIDRA.length === 0) {
      return [];
    }

    // Rate limit: one request every 3 seconds (SendGrid API is rate-limited)
    const rateLimitDelay = 3000;
    const emailDetailRA = [];

    // Process each message ID with rate limiting
    for (let i = 0; i < msgIDRA.length; i++) {
      // Wait before making request (except for first one)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
      }

      const emailDetail = await getEmailDetailFromAPI(msgIDRA[i].msg_id || msgIDRA[i], vert);
      
      if (emailDetail && !emailDetail.response) {
        emailDetailRA.push(emailDetail);
      }
    }

    // Loop the array of emails and prep them for logging
    const emailLogRA = [];
    for (let i = 0; i < emailDetailRA.length; i++) {
      let emailLogObj = _.assign({}, emailDetailRA[i]);
      
      // Merge unique_args into main object
      if (emailLogObj.unique_args) {
        emailLogObj = _.assign(emailLogObj, emailLogObj.unique_args);
      }

      if (emailLogObj._est) {
        emailLogObj._est = Number(emailLogObj._est);
      }

      emailLogObj.sg_message_id = String(emailLogObj.msg_id || emailLogObj.message_id || '');

      // If we have an array of events (we almost certainly will)
      if (emailLogObj.events && Array.isArray(emailLogObj.events)) {
        // Loop them and transform
        for (let j = 0; j < emailLogObj.events.length; j++) {
          const thisActObj = {};

          if (emailLogObj.events[j].event_name) {
            thisActObj.act = _.trim(emailLogObj.events[j].event_name);
            thisActObj.tsp = moment.utc(emailLogObj.events[j].processed || emailLogObj.events[j].timestamp).format();
            thisActObj._x = (_.trim(emailLogObj.events[j].event_name) === 'delivered') ? 99 : 0;
          }

          if (emailLogObj.events[j].reason) {
            thisActObj.rsp = _.trim(emailLogObj.events[j].reason);
          }

          emailLogObj.events[j] = _.assign({}, thisActObj);
        }
      }

      delete emailLogObj.unique_args;
      delete emailLogObj.msg_id;
      delete emailLogObj.message_id;

      emailLogRA.push(_.assign({}, emailLogObj));
    }

    // Log them using the logEmail function
    if (emailLogRA.length > 0) {
      await logEmail(emailLogRA);
    }

    return emailLogRA;
  } catch (error) {
    console.error('Error importing email detail from API:', error);
    throw error;
  }
}

