/**
 * Email Service
 * Migrated from services/EmailService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import {
  logEmail as logEmailFunc,
  validateEmail as validateEmailFunc,
  verifyEmail as verifyEmailFunc,
  getUserPhone as getUserPhoneFunc,
  sendVerificationCode as sendVerificationCodeFunc,
  getEmailListFromAPI,
  importEmailDetailFromAPI
} from '../functions/sendgrid.js';
import _ from 'lodash';
import moment from 'moment-timezone';

class EmailService {
  /**
   * Log email (SendGrid webhook)
   */
  async logEmail(request) {
    try {
      const form = Array.isArray(request.body) ? request.body : [request.body];
      await logEmailFunc(form);
      return { status: 'success' };
    } catch (error) {
      console.error('Error logging email:', error);
      throw error;
    }
  }

  /**
   * Validate email address
   */
  async validateEmail(request) {
    try {
      return await validateEmailFunc(request.body || {});
    } catch (error) {
      console.error('Error validating email:', error);
      throw error;
    }
  }

  /**
   * Verify email address has eventsquid account
   */
  async verifyEmail(request) {
    try {
      return await verifyEmailFunc(request);
    } catch (error) {
      console.error('Error verifying email:', error);
      throw error;
    }
  }

  /**
   * Find emails by status
   */
  async findEmailsByStatus(request) {
    try {
      const { mailType, id, status } = request.pathParameters || {};
      const vert = request.headers?.vert || request.vert || '';

      // Email logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const mailLogs = db.collection('mail-logs');

      const filterObj = {
        utp: String(mailType || '')
      };

      // The id filter is dependent upon the mailType
      if (mailType === 'commcenter') {
        filterObj.mi = Number(id);
      } else if (mailType === 'confirmation') {
        filterObj.fme = Number(id);
      }

      // Certain statuses need to be rewritten
      if (status === 'success') {
        filterObj['avy.act'] = { $in: ['delivered', 'accepted'] };
      } else if (status === 'fail') {
        filterObj['avy.act'] = { $ne: 'delivered' };
      } else if (status === 'queued') {
        filterObj['avy.act'] = { $nin: ['bounce', 'delivered', 'dropped'] };
      }

      const detailsRA = await mailLogs
        .find(filterObj, {
          projection: { _id: 0, avy: 1, lu: 1, ue: 1, tou: 1, f3: 1 }
        })
        .sort({ lu: -1 })
        .toArray();

      // Get the affected user IDs
      const userIDsRA = _.map(detailsRA, 'tou').filter(id => id);

      if (userIDsRA.length > 0) {
        const connection = await getConnection(vert);
        const dbName = getDatabaseName(vert);

        const userDetailsRA = await connection.sql(`
          USE ${dbName};
          SELECT
            user_firstname AS uf,
            user_lastname AS ul,
            [user_id] AS u
          FROM b_users
          WHERE user_id IN (${userIDsRA.join(',')})
        `).execute();

        // Loop the email details
        for (let i = 0; i < detailsRA.length; i++) {
          const ud = _.filter(userDetailsRA, ['u', Number(detailsRA[i].tou)])[0];

          if (ud === undefined) {
            detailsRA[i].uf = '[ user deleted ]';
            detailsRA[i].ul = '';
            detailsRA[i].showactivity = false;
          } else {
            detailsRA[i].uf = String(ud.uf);
            detailsRA[i].ul = String(ud.ul);
            detailsRA[i].showactivity = false;
          }
        }
      }

      return detailsRA;
    } catch (error) {
      console.error('Error finding emails by status:', error);
      throw error;
    }
  }

  /**
   * Find emails by type
   */
  async findEmailsByType(request) {
    try {
      const { mailType, id } = request.pathParameters || {};
      const projection = request.pathParameters?.projection || {};

      // Email logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const mailLogs = db.collection('mail-logs');

      const filterObj = {
        utp: String(mailType || '')
      };

      // The id filter is dependent upon the mailType
      if (mailType === 'commcenter') {
        filterObj.fma = Number(id);
      } else if (mailType === 'confirmation') {
        filterObj.fme = Number(id);
      } else if (mailType === 'invitation') {
        filterObj.fme = Number(id);
      }

      const projObj = Object.keys(projection).length > 0 ? { projection } : {};

      const results = await mailLogs
        .find(filterObj, projObj)
        .sort({ lu: -1 })
        .toArray();

      return results;
    } catch (error) {
      console.error('Error finding emails by type:', error);
      throw error;
    }
  }

  /**
   * Find email counts by status
   */
  async findEmailCountsByStatus(request) {
    try {
      const { mailType, id } = request.pathParameters || {};

      // Email logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const mailLogs = db.collection('mail-logs');

      const filterObj = {
        utp: String(mailType || '')
      };

      // The id filter is dependent upon the mailType
      if (mailType === 'commcenter') {
        filterObj.mi = Number(id);
      } else if (mailType === 'confirmation') {
        filterObj.fme = Number(id);
      }

      const countsRA = await mailLogs.aggregate([
        { $match: filterObj },
        {
          $group: {
            _id: { status: '$ss' },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.status',
            statii: { $push: { count: '$count' } }
          }
        }
      ]).toArray();

      // Finesse the results into a more sensible resultset
      const returnObj = {};
      for (let i = 0; i < countsRA.length; i++) {
        returnObj[countsRA[i]._id] = Number(countsRA[i].statii[0].count);
      }

      return returnObj;
    } catch (error) {
      console.error('Error finding email counts by status:', error);
      throw error;
    }
  }

  /**
   * Find email log by affiliate
   */
  async findEmailLogByAffiliate(request) {
    try {
      const { affiliateID, mailType } = request.pathParameters || {};
      const vert = request.headers?.vert || request.vert || '';

      // First get emails by type
      const emailLogs = await this.findEmailsByType(request);

      // Gets a list of mailIDs for grabbing data from mailLog table in SQL
      const mailIDs = emailLogs.length ? _.map(emailLogs, 'mi') : [0];

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const emailsRA = await connection.sql(`
        USE ${dbName};
        SELECT TOP 100
          m.mailID,
          m.event_id,
          m.subject,
          m.attachment_id,
          m.surveyID,
          m.surveyTitle,
          m.sendDate,
          m.autoreminder,
          m.recipients,
          m.textmessage,
          e.event_Title
        FROM mailLog m
          LEFT JOIN b_events e ON e.event_id = m.event_id
        WHERE m.affiliate_id = @affiliateID
        AND m.mailID IN (${mailIDs.join(',')})
        ORDER BY m.sendDate DESC
      `)
      .parameter('affiliateID', TYPES.Int, Number(affiliateID))
      .execute();

      const maxEmailID = (Array.isArray(emailsRA) && emailsRA.length
        ? _.maxBy(emailsRA, 'mailID').mailID
        : 0);

      // Email logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const mailLogs = db.collection('mail-logs');

      const countsRA = await mailLogs.aggregate([
        {
          $match: {
            fma: Number(affiliateID),
            utp: mailType,
            mi: { $lte: Number(maxEmailID) }
          }
        },
        { $unwind: '$avy' },
        {
          $group: {
            _id: { mi: '$mi', status: '$avy.act' },
            num: { $sum: 1 }
          }
        }
      ]).toArray();

      // Loop the emails
      for (let i = 0; i < emailsRA.length; i++) {
        // Make text message flag numeric
        emailsRA[i].textmessage = Number(emailsRA[i].textmessage);

        // Remove any null points
        emailsRA[i] = _.omitBy(emailsRA[i], _.isNull);

        // Attachments should be an array
        emailsRA[i].attachments = [];
        if (emailsRA[i].attachment_id) {
          emailsRA[i].attachments = emailsRA[i].attachment_id.split(',');
          delete emailsRA[i].attachment_id;
        }

        // Get the sendgrid counts
        const sg = _.filter(countsRA, ['_id.mi', Number(emailsRA[i].mailID)]);

        emailsRA[i].sent = emailLogs.filter(x => x.mi === emailsRA[i].mailID).length;
        delete emailsRA[i].recipients;

        // Add the delivery data (if it exists)
        emailsRA[i].sendgrid = {
          success: _.sumBy(sg, function(o) {
            return (o._id.status === 'delivered' || o._id.status === 'accepted')
              ? Number(o.num)
              : 0;
          }),
          fail: _.sumBy(sg, function(o) {
            return (o._id.status !== 'delivered' && o._id.status !== 'accepted' &&
              (o._id.status === 'bounce' || o._id.status === 'dropped' || o._id.status === 'blocked'))
              ? Number(o.num)
              : 0;
          })
        };

        emailsRA[i].sendgrid.fail = emailsRA[i].sent - emailsRA[i].sendgrid.success;
      }

      return emailsRA;
    } catch (error) {
      console.error('Error finding email log by affiliate:', error);
      throw error;
    }
  }

  /**
   * Get invitation emails
   */
  async getInvitationEmails(request) {
    try {
      const { id } = request.pathParameters || {};
      const vert = request.headers?.vert || request.vert || '';

      // First get emails by type
      request.pathParameters = {
        ...request.pathParameters,
        mailType: 'invitation',
        id: id
      };
      const emailLogs = await this.findEmailsByType(request);

      if (!emailLogs.length) return [];

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Gets a list of mailIDs for grabbing data from mailLog table in SQL
      const mailIDs = _.map(emailLogs, 'mi');
      // Gets a list of userIDs for grabbing the admin's data from b_users
      const adminIDs = _.map(emailLogs, 'fmu');

      const mailData = await connection.sql(`
        USE ${dbName};
        SELECT
          mailID,
          event_id,
          subject,
          sendDate,
          recipients,
          sendName,
          sendDescription
        FROM mailLog
        WHERE mailID IN (${mailIDs.join(',')})
      `).execute();

      const adminData = await connection.sql(`
        USE ${dbName};
        SELECT
          user_id,
          user_firstname + ' ' + user_lastname as adminName
        FROM b_users
        WHERE user_id IN (${adminIDs.join(',')})
      `).execute();

      const eventZone = await connection.sql(`
        USE ${dbName};
        SELECT TOP 1
          ISNULL(tz.zoneName, '') zoneName
        FROM b_events e
        LEFT JOIN b_timezones tz on tz.timeZoneID = e.timeZone_id
        WHERE event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(id))
      .execute();

      const zoneName = eventZone.length ? eventZone[0].zoneName : '';

      // Group individual emails by the send they are a part of
      let organizedLogs = _.groupBy(emailLogs, 'mi');
      organizedLogs = _.keys(organizedLogs).map(key => organizedLogs[key]);

      // Format each blast into one object with the data we need
      const formattedLogs = organizedLogs.map(logGroup => {
        if (logGroup.length) {
          // Each record in the group should have the same mailID and templateID
          const { mi, fmu } = logGroup[0];
          // Get the mail and template data
          const logMailData = _.filter(mailData, ['mailID', Number(mi)]);
          const logAdminData = _.filter(adminData, ['user_id', Number(fmu)]);

          // Count delivered and failed emails
          const success = Number(_.sumBy(logGroup, log =>
            log.avy.filter(e => e.act === 'delivered' || e.act === 'accepted').length > 0
          ));
          const fail = Number(_.sumBy(logGroup, log =>
            log.avy.filter(e => e.act === 'delivered' || e.act === 'accepted').length === 0
          ));

          // If available, get the sendDate, sendName and template description
          const sendDate = logMailData.length ? logMailData[0].sendDate : '';
          const sendName = logMailData.length ? logMailData[0].sendName : '';
          const sendDescription = logMailData.length ? logMailData[0].sendDescription : '';
          const adminName = logAdminData.length ? logAdminData[0].adminName : '';

          // Build an object to represent this whole group send
          return {
            sendDate: moment.utc(sendDate).tz(zoneName).format('MM/DD/YYYY hh:mm A'),
            sendName,
            sendDescription,
            adminName,
            success,
            fail,
            sent: success + fail,
            mailID: mi
          };
        }
      }).filter(Boolean);

      return _.sortBy(formattedLogs, log => new moment(log.sendDate)).reverse();
    } catch (error) {
      console.error('Error getting invitation emails:', error);
      throw error;
    }
  }

  /**
   * Get invitation emails by status
   */
  async getInvitationEmailsByStatus(request) {
    try {
      const { mailID, status } = request.pathParameters || {};

      // Email logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const mailLogs = db.collection('mail-logs');

      const filterObj = {
        utp: 'invitation',
        mi: Number(mailID)
      };

      // Certain statuses need to be rewritten
      if (status === 'queued') {
        filterObj.ss = 'processed';
      } else if (status === 'success') {
        delete filterObj.ss;
        filterObj['avy.act'] = { $in: ['delivered', 'accepted'] };
      } else if (status === 'fail') {
        delete filterObj.ss;
        filterObj['avy.act'] = { $nin: ['delivered', 'accepted'] };
      } else if (status === 'all') {
        delete filterObj.ss;
      } else {
        filterObj.ss = status;
      }

      // Get the email details by status
      let logs = await mailLogs
        .find(filterObj)
        .sort({ lu: -1 })
        .toArray();

      logs = _.map(logs, log => ({ ...log, showActivity: log.ss !== 'delivered' }));

      return logs;
    } catch (error) {
      console.error('Error getting invitation emails by status:', error);
      throw error;
    }
  }

  /**
   * Get notification emails
   */
  async getNotificationEmails(request) {
    try {
      const { eventID, vertID } = request.pathParameters || {};

      // Email logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const mailLogs = db.collection('mail-logs');

      const filterObj = {
        cat: 'Notification',
        s: vertID, // Site, e.g. es for Eventsquid
        fme: Number(eventID)
      };

      // Get the email details
      let logs = await mailLogs
        .find(filterObj)
        .sort({ lu: -1 })
        .toArray();

      logs = _.map(logs, log => ({ ...log, showActivity: false }));

      return logs;
    } catch (error) {
      console.error('Error getting notification emails:', error);
      throw error;
    }
  }

  /**
   * Get contestant emails
   */
  async getContestantEmails(request) {
    try {
      const { contestantID } = request.pathParameters || {};
      const index = request.queryStringParameters?.index;
      const vert = request.headers?.vert || request.vert || '';

      // Email logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const mailLogs = db.collection('mail-logs');

      // Set up filter to find logs with the given contestant ID and that have a mailID
      let filter = {
        toc: Number(contestantID),
        mi: { $exists: 1 },
        s: vert
      };

      // Grabs a total count of emails
      const count = await mailLogs.countDocuments(filter);

      if (count === 0) {
        return {
          logs: [],
          totalCount: count
        };
      }

      // If an index query is passed, find mail after the given date
      if (index) {
        filter.lu = { $lt: new Date(index) };
      }

      // Grab 5 logs from Mongo
      let logs = await mailLogs
        .find(filter)
        .sort({ lu: -1 })
        .limit(5)
        .toArray();

      if (!logs.length) {
        return {
          logs: [],
          totalCount: count
        };
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Generate SQL query to grab all the mail data from SQL
      const mailData = await connection.sql(`
        USE ${dbName};
        SELECT
          m.mailID,
          m.event_id,
          m.subject,
          m.sendDate,
          (
            SELECT tz.timeZoneOffset
            FROM b_timeZones tz
            WHERE tz.timeZoneID = (
              SELECT timeZone_id
              FROM b_events
              WHERE event_id = m.event_id
            )
          ) as tzOffset
        FROM mailLog m
        WHERE m.mailID IN (${_.map(logs, 'mi').join(',')})
        ORDER BY m.sendDate desc
      `).execute();

      // Map through the mongo records and grab appropriate SQL data
      logs = logs.map(log => {
        // Get the SQL record for this mail log
        const data = mailData.filter(mailLog => log.mi === mailLog.mailID)[0];

        return {
          mailID: data?.mailID,
          subject: data?.subject,
          sendDate: data ? moment.utc(data.sendDate).utcOffset(data.tzOffset).format('MM/DD/YYYY hh:mm A') : '',
          status: log.ss,
          type: log.utp,
          lu: log.lu // Used as an index for grabbing more
        };
      });

      return { logs, totalCount: count };
    } catch (error) {
      console.error('Error getting contestant emails:', error);
      throw error;
    }
  }

  /**
   * Get email list from API
   */
  async getEmailListFromAPI(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT || '';
      return await getEmailListFromAPI(request.body || {}, vert);
    } catch (error) {
      console.error('Error getting email list from API:', error);
      throw error;
    }
  }

  /**
   * Import email detail from API
   */
  async importEmailDetailFromAPI(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT || '';
      const msgIDRA = request.body?.msgIDRA || [];
      return await importEmailDetailFromAPI(msgIDRA, vert);
    } catch (error) {
      console.error('Error importing email detail from API:', error);
      throw error;
    }
  }

  /**
   * Send verification code
   */
  async sendVerificationCode(request) {
    try {
      return await sendVerificationCodeFunc(request.body || {});
    } catch (error) {
      console.error('Error sending verification code:', error);
      throw error;
    }
  }

  /**
   * Get user phone
   */
  async getUserPhone(request) {
    try {
      return await getUserPhoneFunc(request);
    } catch (error) {
      console.error('Error getting user phone:', error);
      throw error;
    }
  }
}

export default EmailService;

