/**
 * VEO functions
 * Migrated from Mantle functions/veo
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import moment from 'moment-timezone';

/**
 * Get share URL by event ID
 */
export async function getShareURLByEventID(eventID, affiliateID, vert) {
  try {
    const db = await getDatabase(null, vert);
    const eventsCollection = db.collection('events');

    const eventsRA = await eventsCollection
      .find(
        {
          e: Number(eventID),
          a: Number(affiliateID),
          _x: { $ne: true }
        },
        {
          projection: { _id: 0, e: 1, eg: 1, et: 1 }
        }
      )
      .toArray();

    return eventsRA[0] || {};
  } catch (error) {
    console.error('Error getting share URL by event ID:', error);
    throw error;
  }
}

/**
 * Get options by event GUID
 */
export async function getOptions(eventGUID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventGUID', sql.UniqueIdentifier, eventGUID);
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoGetOptionsWithSponsors @eventGUID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting VEO options:', error);
    throw error;
  }
}

/**
 * Save option
 */
export async function saveOption(eventGUID, colName, fieldValue, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Convert fieldValue to string, handling null and numbers
    const fieldValueStr = fieldValue === null || fieldValue === undefined 
      ? null 
      : String(fieldValue);

    const request = new sql.Request();
    request.input('eventGUID', sql.UniqueIdentifier, eventGUID);
    request.input('colName', sql.VarChar, colName);
    // Use NVarChar for nullable strings (handles null values)
    request.input('fieldValue', sql.NVarChar, fieldValueStr);
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoSaveOption @eventGUID, @colName, @fieldValue
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error saving VEO option:', error);
    throw error;
  }
}

/**
 * Connector - Get options by slot ID
 */
export async function connectorGetOptions(slotID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('slotID', sql.Int, Number(slotID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoConnectorGetOptions @slotID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting connector options:', error);
    throw error;
  }
}

/**
 * Connector - Save option
 */
export async function connectorSaveOption(form, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('slotID', sql.Int, Number(form.slotID));
    request.input('colName', sql.VarChar, form.colName);
    request.input('fieldValue', sql.VarChar, form.fieldValue);
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoConnectorSaveOption @slotID, @colName, @fieldValue
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error saving connector option:', error);
    throw error;
  }
}

/**
 * Get ratings config by slot and user
 */
export async function getRatingsConfigBySlotAndUser(userID, slotID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('userID', sql.Int, Number(userID));
    request.input('slotID', sql.Int, Number(slotID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getRatingsConfigBySlotAndUser @userID, @slotID
    `);
    const qryRA = result.recordset;

    const qryObj = qryRA[0] || {};

    // If we have speakers to review, even if the session doesn't allow reviews
    if (!qryObj.reviews_on && qryObj.reviewable_speakers > 0) {
      // Enable reviewing
      qryObj.reviews_on = true;
    }

    delete qryObj.reviewable_speakers;

    return [qryObj];
  } catch (error) {
    console.error('Error getting ratings config by slot and user:', error);
    throw error;
  }
}

/**
 * Check usage
 */
export async function checkUsage(slotID, userID, actionID, vert) {
  try {
    const db = await getDatabase(null, vert);
    const vtColl = db.collection('veo-tracking');

    const vtResult = await vtColl
      .find(
        {
          u: Number(userID),
          sli: Number(slotID),
          act: actionID
        },
        {
          projection: { _id: 0, ts: 1 }
        }
      )
      .limit(1)
      .sort({ ts: -1 })
      .toArray();

    return vtResult[0] || {};
  } catch (error) {
    console.error('Error checking usage:', error);
    throw error;
  }
}

/**
 * Check usage by event and action
 */
export async function checkUsageByEventAndAction(eventID, userID, actionID, vert) {
  try {
    const db = await getDatabase(null, vert);
    const vtColl = db.collection('veo-tracking');

    const vtResult = await vtColl
      .find(
        {
          u: Number(userID),
          e: Number(eventID),
          act: actionID
        },
        {
          projection: { _id: 0, ts: 1, sli: 1 }
        }
      )
      .sort({ ts: -1 })
      .toArray();

    return vtResult;
  } catch (error) {
    console.error('Error checking usage by event and action:', error);
    throw error;
  }
}

/**
 * Set usage
 */
export async function setUsage(eventID, slotID, actionID, session, vert) {
  try {
    const db = await getDatabase(null, vert);
    const vtColl = db.collection('veo-tracking');

    const { _realip, cfid, cftoken, user_id } = session || {};

    const result = await vtColl.insertOne({
      u: Number(user_id || 0),
      e: Number(eventID),
      sli: Number(slotID),
      s: vert,
      act: actionID,
      ts: new Date(),
      ip: _realip || '',
      cfid: cfid || '',
      cftoken: cftoken || ''
    });

    return result || {};
  } catch (error) {
    console.error('Error setting usage:', error);
    throw error;
  }
}

/**
 * Scheduling Grid - Get slots
 */
export async function schedulingGridGetSlots(scheduleID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('scheduleID', sql.Int, Number(scheduleID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoGetSchedulingGrid2 @scheduleID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting scheduling grid slots:', error);
    throw error;
  }
}

/**
 * Scheduling Grid - Export slots
 */
export async function schedulingGridExportSlots(scheduleID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('scheduleID', sql.Int, Number(scheduleID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoExportSchedulingGrid @scheduleID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error exporting scheduling grid slots:', error);
    throw error;
  }
}

/**
 * Scheduling Grid - Get venues
 */
export async function schedulingGridGetVenues(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoGetVenues @affiliateID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting scheduling grid venues:', error);
    throw error;
  }
}

/**
 * Scheduling Grid - Get rooms by affiliate
 */
export async function schedulingGridGetRoomsByAffiliate(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_veoGetRoomsByAffiliate @affiliateID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting scheduling grid rooms by affiliate:', error);
    throw error;
  }
}

