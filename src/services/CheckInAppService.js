/**
 * Check-In App Service
 * Migrated from Mantle CheckInAppService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _eventService from './EventService.js';

class CheckInAppService {
  /**
   * Get preferences
   */
  async getPreferences(request) {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get event preferences
      const sqlRequest = new sql.Request();
      sqlRequest.input('eventID', sql.Int, eventID);
      const result = await sqlRequest.query(`
        USE ${dbName};
        SELECT autoAdvance, autoAdvanceRevert, multiDayCheckIn
        FROM b_events
        WHERE event_id = @eventID
      `);
      const eventPreferences = result.recordset;

      // Get reg items
      const regItems = await this.getRegItemsByEventID(eventID, vert, sql, dbName);

      // Get event duration
      const eventDuration = await _eventService.getEventDuration(eventID, vert);

      const preferences = {
        ...(eventPreferences[0] || {}),
        eventDuration,
        regItems
      };

      return preferences;
    } catch (error) {
      console.error('Error getting check-in app preferences:', error);
      throw error;
    }
  }

  /**
   * Get reg items by event ID
   */
  async getRegItemsByEventID(eventID, vert, sql, dbName) {
    try {
      const sqlRequest = new sql.Request();
      sqlRequest.input('eventID', sql.Int, Number(eventID));
      const result = await sqlRequest.query(`
        USE ${dbName};
        SELECT 
          ef.eventFeeID, 
          ef.customFeeName, 
          ef.hideFromCheckInApp, 
          ef.scanToRegister, 
          ef.disableDecrementing, 
          ef.custLimit, 
          ef.guestInvite, 
          ef.invisible, 
          efg.group_id, 
          efg.group_name, 
          efg.color, 
          eft.fee_type_id, 
          eft.fee_name
        FROM event_fees ef
        JOIN event_fee_types eft ON ef.fee_type_id = eft.fee_type_id
        FULL OUTER JOIN event_fee_groups efg ON ef.group_id = efg.group_id
        WHERE ef.event_id = @eventID AND (invisible IS NULL OR invisible != 1)
        ORDER BY fee_type_id
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error getting reg items by event ID:', error);
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
      const bodyKeys = Object.keys(body);

      let column = '';
      let table = '';
      let condition = '';
      let updatedValue = null;
      let conditionValue = null;
      let valueType = TYPES.VarChar;

      // Determine which field to update
      switch (bodyKeys[0]) {
        case 'autoAdvanceRevert':
          column = 'autoAdvanceRevert';
          table = 'b_events';
          condition = 'event_id';
          conditionValue = eventID;
          updatedValue = Number(body.autoAdvanceRevert);
          valueType = TYPES.Float;
          break;
        case 'autoAdvance':
          column = 'autoAdvance';
          table = 'b_events';
          condition = 'event_id';
          conditionValue = eventID;
          updatedValue = Number(body.autoAdvance);
          valueType = TYPES.Bit;
          break;
        case 'multiDayCheckIn':
          column = 'multiDayCheckIn';
          table = 'b_events';
          condition = 'event_id';
          conditionValue = eventID;
          updatedValue = Number(body.multiDayCheckIn);
          valueType = TYPES.Bit;
          break;
        case 'hideFromCheckInApp':
          column = 'hideFromCheckInApp';
          table = 'event_fees';
          condition = 'eventFeeID';
          conditionValue = Number(body.eventFeeID);
          updatedValue = Number(body.hideFromCheckInApp);
          valueType = TYPES.Bit;
          break;
        case 'scanToRegister':
          column = 'scanToRegister';
          table = 'event_fees';
          condition = 'eventFeeID';
          conditionValue = Number(body.eventFeeID);
          updatedValue = Number(body.scanToRegister);
          valueType = TYPES.Bit;
          break;
        case 'disableDecrementing':
          column = 'disableDecrementing';
          table = 'event_fees';
          condition = 'eventFeeID';
          conditionValue = Number(body.eventFeeID);
          updatedValue = Number(body.disableDecrementing);
          valueType = TYPES.Bit;
          break;
        default:
          return {};
      }

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Update MSSQL
      const sqlRequest = new sql.Request();
      sqlRequest.input('updatedValue', valueType, updatedValue);
      sqlRequest.input('conditionValue', sql.Int, conditionValue);
      await sqlRequest.query(`
        USE ${dbName};
        UPDATE ${table}
        SET ${column} = @updatedValue
        WHERE ${condition} = @conditionValue
      `);

      // If updating event_fees, sync to MongoDB
      if (table === 'event_fees') {
        const db = await getDatabase(null, vert);
        const eventsCollection = db.collection('events');
        const evfsField = `evfs.$.${column}`;

        await eventsCollection.updateOne(
          { '_id.e': eventID, 'evfs.f': Number(body.eventFeeID) },
          { $set: { [evfsField]: Boolean(updatedValue) } }
        );
      }

      return {
        message: 'Settings updated!',
        updated: body[bodyKeys[0]]
      };
    } catch (error) {
      console.error('Error updating check-in app preferences:', error);
      throw error;
    }
  }
}

export default new CheckInAppService();

