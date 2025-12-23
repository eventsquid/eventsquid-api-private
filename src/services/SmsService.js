/**
 * SMS Service
 * Migrated from services/SmsService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import _ from 'lodash';
import twilio from 'twilio';
import { generateVerifyCode } from '../functions/verification.js';

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

class SmsService {
  /**
   * Log Twilio status callback
   */
  async logMessage(request) {
    try {
      // SMS logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const smsLogs = db.collection('mail-logs');

      await smsLogs.updateOne(
        { sid: String(request.body?.MessageSid || '') },
        {
          // Update the last updated date
          $currentDate: { lu: { $type: 'date' } },
          // Add non-duplicated activity objects to the array
          $addToSet: {
            avy: {
              act: _.trim(request.body?.MessageStatus || ''),
              tsp: new Date()
            }
          },
          $set: { ss: _.trim(request.body?.MessageStatus || '') }
        }
      );

      return { status: 'success', message: 'Message logged' };
    } catch (error) {
      console.error('Error logging message:', error);
      throw error;
    }
  }

  /**
   * Send SMS message
   */
  async sendMessage(request) {
    try {
      if (!client) {
        throw new Error('Twilio client not initialized. Check TWILIO_ACCT_SID and TWILIO_AUTH_TOKEN environment variables.');
      }

      // SMS logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const smsLogs = db.collection('mail-logs');

      const form = request.body || {};
      const from = _.assign({}, form.from || {});
      const toArray = Array.isArray(form.to) ? form.to : [];

      // Get host from request headers or environment
      const host = request.headers?.['host'] || 
                   request.headers?.['Host'] || 
                   process.env.API_GATEWAY_HOST || 
                   '';

      // Loop the recipients
      for (let i = 0; i < toArray.length; i++) {
        const to = _.assign({}, toArray[i]);
        let txt = _.trim(form.body || '');

        if (to.body) {
          txt = _.trim(to.body);
        }

        if (to.custom) {
          txt = `${txt}\n\n${_.trim(to.custom)}`;
        }

        try {
          const message = await client.messages.create({
            body: txt,
            to: String(toArray[i].to),
            statusCallback: `${process.env.API_GATEWAY_PROTOCOL || 'https'}://${host}/sms/${process.env.TWILIO_STATUS_CALLBACK || 'twilio-status'}`,
            messagingServiceSid: process.env.TWILIO_MSG_SERVICE_SID
          });

          const thisMsgID = 'ES:' + _.trim(message.sid);

          await smsLogs.insertOne({
            _id: String(thisMsgID),
            um: String(message.to),
            fma: Number(from.from_a || 0),
            fme: Number(from.from_e || 0),
            fmu: Number(from.from_u || 0),
            toc: Number(to.to_c || 0),
            tou: Number(to.to_u || 0),
            tge: Number(to.tgt_e || 0),
            srv: Number(to.srv_id || 0),
            mi: Number(from.mailID || 0),
            utp: String(from.type || ''),
            s: String(request.headers?.vert || request.vert || ''),
            txt: _.trim(message.body),
            ix: true,
            lu: new Date(),
            sid: String(message.sid),
            avy: [
              {
                act: message.status,
                id: message.sid,
                tsp: new Date(message.dateUpdated)
              }
            ]
          });
        } catch (err) {
          console.error(`Error sending SMS to ${toArray[i].to}:`, err);
          throw err;
        }
      }

      return { status: 'success', message: 'Messages sent' };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Find message body by ID
   */
  async findMessageBody(request) {
    try {
      const { id } = request.pathParameters || {};
      const vert = request.headers?.vert || request.vert || '';

      // SMS logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const smsLogs = db.collection('mail-logs');

      const detailsRA = await smsLogs
        .find(
          { mi: Number(id), s: String(vert) },
          { projection: { _id: 0, txt: 1 } }
        )
        .sort({ lu: -1 })
        .toArray();

      return detailsRA.length > 0 ? detailsRA[0] : {};
    } catch (error) {
      console.error('Error finding message body:', error);
      throw error;
    }
  }

  /**
   * Send verification code
   */
  async sendVerificationCode(request) {
    try {
      const { email, phone } = request.body || {};

      if (!email || !phone) {
        throw new Error('Email and phone are required');
      }

      // Generate verification code
      const code = await generateVerifyCode(email);

      // Prepare message body
      request.body.body = `Your verification code is ${code} \n\nThis code is good for 15 minutes`;
      request.body.to = [
        {
          to: phone,
          custom: 'Eventsquid'
        }
      ];

      // Send SMS
      try {
        await this.sendMessage(request);
        return { success: true, data: 'SMS Sent' };
      } catch (err) {
        console.error('Error sending verification code SMS:', err);
        return { success: false, data: 'SMS Not Sent' };
      }
    } catch (error) {
      console.error('Error sending verification code:', error);
      throw error;
    }
  }
}

export default SmsService;

