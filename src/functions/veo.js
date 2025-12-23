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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const result = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_veoGetOptionsWithSponsors @eventGUID
    `)
    .parameter('eventGUID', TYPES.UniqueIdentifier, eventGUID)
    .execute();

    return result;
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const result = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_veoSaveOption @eventGUID, @colName, @fieldValue
    `)
    .parameter('eventGUID', TYPES.UniqueIdentifier, eventGUID)
    .parameter('colName', TYPES.VarChar, colName)
    .parameter('fieldValue', TYPES.VarChar, fieldValue)
    .execute();

    return result;
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const result = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_veoConnectorGetOptions @slotID
    `)
    .parameter('slotID', TYPES.Int, Number(slotID))
    .execute();

    return result;
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const result = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_veoConnectorSaveOption @slotID, @colName, @fieldValue
    `)
    .parameter('slotID', TYPES.Int, Number(form.slotID))
    .parameter('colName', TYPES.VarChar, form.colName)
    .parameter('fieldValue', TYPES.VarChar, form.fieldValue)
    .execute();

    return result;
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const qryRA = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_getRatingsConfigBySlotAndUser @userID, @slotID
    `)
    .parameter('userID', TYPES.Int, Number(userID))
    .parameter('slotID', TYPES.Int, Number(slotID))
    .execute();

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

