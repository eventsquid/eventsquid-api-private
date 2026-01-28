/**
 * Report Service
 * Migrated from services/ReportService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { ObjectId } from 'mongodb';
import {
  getEventDetailsByGUID,
  getReportDetailsByGUID,
  getReportingMenu,
  getBiosByEventID,
  checkDupTemplateName,
  getTemplates,
  findEventReportConfig,
  getRegistrantFilters,
  registrantReport,
  registrantReportExport,
  getRegistrantTransactionsReport,
  saveRegistrantTemplate,
  deleteTemplate,
  shareTemplate
} from '../functions/reports.js';
import _eventsService from './EventService.js';

class ReportService {
  /**
   * Get event details by GUID
   */
  async getEventDetailsByGUID(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventGUID = request.pathParameters?.eventGUID;
      const session = request.session || request.user || {};

      return await getEventDetailsByGUID(eventGUID, vert, session);
    } catch (error) {
      console.error('Error getting event details by GUID:', error);
      throw error;
    }
  }

  /**
   * Get report details by GUID
   */
  async getReportDetailsByGUID(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportGUID = request.pathParameters?.reportGUID;
      const session = request.session || request.user || {};

      return await getReportDetailsByGUID(reportGUID, vert, session);
    } catch (error) {
      console.error('Error getting report details by GUID:', error);
      throw error;
    }
  }

  /**
   * Get reporting menu
   */
  async getReportingMenu(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const user_admin_level = request.session?.user_admin_level || request.user?.user_admin_level || 0;

      return await getReportingMenu(eventID, affiliateID, user_admin_level, vert);
    } catch (error) {
      console.error('Error getting reporting menu:', error);
      throw error;
    }
  }

  /**
   * Registrant report
   */
  async registrantReport(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;

      return await registrantReport(eventID, vert, request.body || {});
    } catch (error) {
      console.error('Error generating registrant report:', error);
      throw error;
    }
  }

  /**
   * Export registrant report
   */
  async registrantReportExport(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportGUID = request.pathParameters?.reportGUID;
      const format = request.pathParameters?.format;
      const checkID = request.pathParameters?.checkID;
      const session = request.session || request.user || {};

      return await registrantReportExport(reportGUID, format, checkID, vert, session);
    } catch (error) {
      console.error('Error exporting registrant report:', error);
      throw error;
    }
  }

  /**
   * Get registrant filters
   */
  async getRegistrantFilters(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;

      return await getRegistrantFilters(eventID, vert);
    } catch (error) {
      console.error('Error getting registrant filters:', error);
      throw error;
    }
  }

  /**
   * Save registrant template
   */
  async saveRegistrantTemplate(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;
      const session = request.session || request.user || {};

      return await saveRegistrantTemplate(eventID, vert, request.body, session);
    } catch (error) {
      console.error('Error saving registrant template:', error);
      throw error;
    }
  }

  /**
   * Get registrant templates
   */
  async getRegistrantTemplates(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;
      const session = request.session || request.user || {};

      return await getTemplates(eventID, vert, 'registrant', session);
    } catch (error) {
      console.error('Error getting registrant templates:', error);
      throw error;
    }
  }

  /**
   * Get registrant transactions report
   */
  async getRegistrantTransactionsReport(reqDetails) {
    try {
      const {
        affiliateID,
        eventID,
        keyword,
        fromDate,
        toDate,
        payMethod,
        vert
      } = reqDetails;

      return await getRegistrantTransactionsReport(
        affiliateID,
        eventID,
        keyword,
        fromDate,
        toDate,
        payMethod || '',
        vert || reqDetails.vert
      );
    } catch (error) {
      console.error('Error getting registrant transactions report:', error);
      throw error;
    }
  }

  /**
   * Check duplicate template name
   */
  async checkDupTemplateName(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;
      const reportType = request.pathParameters?.reportType;
      const templateName = request.pathParameters?.templateName;

      const isDuplicate = await checkDupTemplateName(eventID, reportType, templateName, vert);
      // OLD CODE BEHAVIOR: Return boolean directly, not wrapped in object
      return isDuplicate;
    } catch (error) {
      console.error('Error checking duplicate template name:', error);
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;
      const idg = request.pathParameters?.idg;
      const reportType = request.pathParameters?.reportType;
      const session = request.session || request.user || {};

      return await deleteTemplate(eventID, idg, reportType, vert, session);
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Share template
   */
  async shareTemplate(request) {
    try {
      const session = request.session || request.user || {};

      return await shareTemplate(request.body, session);
    } catch (error) {
      console.error('Error sharing template:', error);
      throw error;
    }
  }

  /**
   * Get bios by event ID
   */
  async getBiosByEventID(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventID = request.pathParameters?.eventID;

      return await getBiosByEventID(eventID, vert);
    } catch (error) {
      console.error('Error getting bios by event ID:', error);
      throw error;
    }
  }

  /**
   * Find event report config
   */
  async findEventReportConfig(request) {
    try {
      // We need to check if the event configuration is up-to-date
      // TODO: Implement EventService.updateEventConfig if needed
      // await _eventsService.updateEventConfig(request);

      return await findEventReportConfig(request);
    } catch (error) {
      console.error('Error finding event report config:', error);
      throw error;
    }
  }

  /**
   * Get CEU Summary Report
   */
  async getCEUSummaryReport(eventID, query, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const params = ['@eventID'];
      // OLD CODE BEHAVIOR: Only add parameters if they have actual values (not empty strings)
      if (query.categoryIDList && String(query.categoryIDList).trim().length > 0) {
        params.push('@categoryIDList');
      }
      if (query.attendeeSearchCriteria && String(query.attendeeSearchCriteria).trim().length > 0) {
        params.push('@attendeeSearchCriteria');
      }

      const qryStr = `
        USE ${dbName};
        EXEC dbo.ceuSummaryReport ${params.join(', ')}
      `;

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));

      if (query.categoryIDList && String(query.categoryIDList).trim().length > 0) {
        request.input('categoryIDList', sql.VarChar, String(query.categoryIDList).trim());
      }

      if (query.attendeeSearchCriteria && String(query.attendeeSearchCriteria).trim().length > 0) {
        request.input('attendeeSearchCriteria', sql.VarChar, String(query.attendeeSearchCriteria).trim());
      }

      const result = await request.query(qryStr);
      return result.recordset;
    } catch (error) {
      console.error('Error getting CEU summary report:', error);
      throw error;
    }
  }

  /**
   * Get CEU Summary Report filters
   */
  async getCEUSummaryReportFilters(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-summary-reports');

      const report = await layoutsColl.findOne({
        _id: new ObjectId(reportID)
      });

      return report || {};
    } catch (error) {
      console.error('Error getting CEU summary report filters:', error);
      throw error;
    }
  }

  /**
   * Save CEU Summary Report Layout
   */
  async saveCEUSummaryReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const session = request.session || request.user || {};

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-summary-reports');

      const reqBody = {
        ...request.body,
        history: [{
          userEmail: String(session.user_email || ''),
          userFirstName: String(session.user_firstname || ''),
          userLastName: String(session.user_lastname || ''),
          userID: Number(session.user_id),
          date: new Date(),
          act: 'Created report.'
        }]
      };

      const result = await layoutsColl.insertOne(reqBody);
      return { status: 'success', _id: result.insertedId };
    } catch (error) {
      console.error('Error saving CEU summary report layout:', error);
      throw error;
    }
  }

  /**
   * Update CEU Summary Report Layout
   */
  async updateCEUSummaryReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;
      const session = request.session || request.user || {};

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-summary-reports');

      const reqBody = {
        ceuColumnIDs: request.body.ceuColumnIDs,
        eg: request.body.eg,
        name: request.body.name,
        otherColumns: request.body.otherColumns,
        ceuFilterIDs: request.body.ceuFilterIDs,
        searchFilterString: request.body.searchFilterString
      };

      await layoutsColl.updateOne(
        {
          _id: new ObjectId(reportID)
        },
        {
          $set: reqBody,
          $push: {
            history: {
              userEmail: String(session.user_email || ''),
              userFirstName: String(session.user_firstname || ''),
              userLastName: String(session.user_lastname || ''),
              userID: Number(session.user_id),
              date: new Date(),
              act: 'Saved changes.'
            }
          }
        }
      );

      return { status: 'success', message: 'CEU summary report layout updated' };
    } catch (error) {
      console.error('Error updating CEU summary report layout:', error);
      throw error;
    }
  }

  /**
   * Get CEU Detail Report
   */
  async getCEUDetailReport(eventID, query, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const params = ['@eventID'];
      // OLD CODE BEHAVIOR: Only add parameters if they have actual values (not empty strings)
      if (query.attendeeSearchCriteria && String(query.attendeeSearchCriteria).trim().length > 0) {
        params.push('@attendeeSearchCriteria');
      }
      if (query.categoryIDList && String(query.categoryIDList).trim().length > 0) {
        params.push('@categoryIDList');
      }
      if (query.eventFeeIDList && String(query.eventFeeIDList).trim().length > 0) {
        params.push('@eventFeeIDList');
      }

      const qryStr = `
        USE ${dbName};
        EXEC dbo.ceuDetailReport ${params.join(', ')}
      `;

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));

      if (query.attendeeSearchCriteria && String(query.attendeeSearchCriteria).trim().length > 0) {
        request.input('attendeeSearchCriteria', sql.VarChar, String(query.attendeeSearchCriteria).trim());
      }

      if (query.categoryIDList && String(query.categoryIDList).trim().length > 0) {
        request.input('categoryIDList', sql.VarChar, String(query.categoryIDList).trim());
      }

      if (query.eventFeeIDList && String(query.eventFeeIDList).trim().length > 0) {
        request.input('eventFeeIDList', sql.VarChar, String(query.eventFeeIDList).trim());
      }

      const result = await request.query(qryStr);
      return result.recordset;
    } catch (error) {
      console.error('Error getting CEU detail report:', error);
      throw error;
    }
  }

  /**
   * Get CEU Detail Report filters
   */
  async getCEUDetailReportFilters(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-detail-reports');

      const report = await layoutsColl.findOne({
        _id: new ObjectId(reportID)
      });

      return report || {};
    } catch (error) {
      console.error('Error getting CEU detail report filters:', error);
      throw error;
    }
  }

  /**
   * Save CEU Detail Report Layout
   */
  async saveCEUDetailReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const session = request.session || request.user || {};

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-detail-reports');

      const reqBody = {
        ...request.body,
        history: [{
          userEmail: String(session.user_email || ''),
          userFirstName: String(session.user_firstname || ''),
          userLastName: String(session.user_lastname || ''),
          userID: Number(session.user_id),
          date: new Date(),
          act: 'Created report.'
        }]
      };

      const result = await layoutsColl.insertOne(reqBody);
      return { status: 'success', _id: result.insertedId };
    } catch (error) {
      console.error('Error saving CEU detail report layout:', error);
      throw error;
    }
  }

  /**
   * Update CEU Detail Report Layout
   */
  async updateCEUDetailReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;
      const session = request.session || request.user || {};

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-detail-reports');

      const reqBody = {
        eg: request.body.eg,
        name: request.body.name,
        columns: request.body.columns,
        ceuFilterSessionIDs: request.body.ceuFilterSessionIDs,
        ceuFilterCatIDs: request.body.ceuFilterCatIDs
      };

      await layoutsColl.updateOne(
        {
          _id: new ObjectId(reportID)
        },
        {
          $set: reqBody,
          $push: {
            history: {
              userEmail: String(session.user_email || ''),
              userFirstName: String(session.user_firstname || ''),
              userLastName: String(session.user_lastname || ''),
              userID: Number(session.user_id),
              date: new Date(),
              act: 'Saved changes.'
            }
          }
        }
      );

      return { status: 'success', message: 'CEU detail report layout updated' };
    } catch (error) {
      console.error('Error updating CEU detail report layout:', error);
      throw error;
    }
  }
}

export default ReportService;

