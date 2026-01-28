/**
 * Contact Scan App Service
 * Migrated from Mantle ContactScanAppService.js
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

class ContactScanAppService {
  /**
   * Get preferences
   */
  async getPreferences(request) {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const sqlRequest = new sql.Request();
      sqlRequest.input('eventID', sql.Int, eventID);
      const result = await sqlRequest.query(`
        USE ${dbName};
        SELECT
            scanAppActive,
            scanAppCode,
            (SELECT REPLACE('[' + STUFF((SELECT ',' + '"' + mongoField + '"' FROM contactScanAppAPI WHERE event_id = @eventID FOR XML PATH('')), 1, 1, '') + ']', '""', '"')) AS apiFields
        FROM
            b_events e
        WHERE
            e.event_id = @eventID
      `);
      const eventPreferences = result.recordset;

      // Parse apiFields JSON string if present, otherwise set to null
      if (eventPreferences.length) {
        if (eventPreferences[0].apiFields) {
          try {
            const parsed = JSON.parse(eventPreferences[0].apiFields);
            eventPreferences[0].apiFields = Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
          } catch (e) {
            eventPreferences[0].apiFields = null;
          }
        } else {
          eventPreferences[0].apiFields = null;
        }
      }

      return eventPreferences;
    } catch (error) {
      console.error('Error getting contact scan app preferences:', error);
      throw error;
    }
  }

  /**
   * Update preferences
   */
  async updatePreferences(request) {
    try {
      if (!Object.keys(request.body || {}).length) {
        return {};
      }

      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const body = request.body || {};
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const sqlRequest = new sql.Request();
      sqlRequest.input('scanAppActive', sql.Bit, body.scanAppActive);
      sqlRequest.input('scanAppCode', sql.VarChar, body.scanAppCode);
      sqlRequest.input('eventID', sql.Int, eventID);
      await sqlRequest.query(`
        USE ${dbName};
        UPDATE
            b_events
        SET
            scanAppActive = @scanAppActive,
            scanAppCode = @scanAppCode
        WHERE
            event_id = @eventID
      `);

      return {
        message: 'Settings updated!',
        updated: body[Object.keys(body)[0]]
      };
    } catch (error) {
      console.error('Error updating contact scan app preferences:', error);
      throw error;
    }
  }

  /**
   * Update API preferences
   */
  async updateAPIPreferences(request) {
    try {
      if (!Object.keys(request.body || {}).length) {
        return {};
      }

      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const checkedNames = Array.isArray(request.body) ? request.body : [];
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Delete existing API preferences
      const deleteRequest = new sql.Request();
      deleteRequest.input('eventID', sql.Int, eventID);
      await deleteRequest.query(`
        USE ${dbName};
        DELETE FROM contactScanAppAPI WHERE event_id = @eventID;
      `);

      // Insert new API preferences
      for (let i = 0; i < checkedNames.length; i++) {
        const insertRequest = new sql.Request();
        insertRequest.input('mongoField', sql.VarChar, checkedNames[i]);
        insertRequest.input('eventID', sql.Int, eventID);
        await insertRequest.query(`
          USE ${dbName};
          INSERT INTO contactScanAppAPI
          (endPoint, event_id, mongoField)
          VALUES
          ('attendees', @eventID, @mongoField)
        `);
      }

      return {
        message: 'Settings updated!',
        updated: checkedNames[0]
      };
    } catch (error) {
      console.error('Error updating contact scan app API preferences:', error);
      throw error;
    }
  }
}

export default new ContactScanAppService();

