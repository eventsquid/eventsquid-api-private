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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const eventPreferences = await connection.sql(`
        USE ${dbName};
        SELECT
            scanAppActive,
            scanAppCode,
            (SELECT REPLACE('[' + STUFF((SELECT ',' + '"' + mongoField + '"' FROM contactScanAppAPI WHERE event_id = @eventID FOR XML PATH('')), 1, 1, '') + ']', '""', '"')) AS apiFields
        FROM
            b_events e
        WHERE
            e.event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .execute();

      // Parse apiFields JSON string if present
      if (eventPreferences.length && eventPreferences[0].apiFields) {
        try {
          eventPreferences[0].apiFields = JSON.parse(eventPreferences[0].apiFields);
        } catch (e) {
          eventPreferences[0].apiFields = [];
        }
      } else if (eventPreferences.length) {
        eventPreferences[0].apiFields = [];
      }

      return eventPreferences.length ? eventPreferences[0] : {};
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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        UPDATE
            b_events
        SET
            scanAppActive = @scanAppActive,
            scanAppCode = @scanAppCode
        WHERE
            event_id = @eventID
      `)
      .parameter('scanAppActive', TYPES.Bit, body.scanAppActive)
      .parameter('scanAppCode', TYPES.VarChar, body.scanAppCode)
      .parameter('eventID', TYPES.Int, eventID)
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Delete existing API preferences
      await connection.sql(`
        USE ${dbName};
        DELETE FROM contactScanAppAPI WHERE event_id = @eventID;
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .execute();

      // Insert new API preferences
      for (let i = 0; i < checkedNames.length; i++) {
        await connection.sql(`
          USE ${dbName};
          INSERT INTO contactScanAppAPI
          (endPoint, event_id, mongoField)
          VALUES
          ('attendees', @eventID, @mongoField)
        `)
        .parameter('mongoField', TYPES.VarChar, checkedNames[i])
        .parameter('eventID', TYPES.Int, eventID)
        .execute();
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

