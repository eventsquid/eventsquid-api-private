/**
 * Attendee functions
 * Migrated from Mantle functions/attendees
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

/**
 * Get registered attendee by user ID and event ID
 * Grabs an attendee who has completed registration (rc: 1)
 */
export async function getRegisteredAttendeeByUserID(userID, eventID, vert) {
  try {
    const db = await getDatabase(null, vert);
    const attendeesCollection = db.collection('attendees');

    const attendee = await attendeesCollection.findOne({
      u: Number(userID),
      e: Number(eventID),
      rc: 1  // regcomplete = 1
    });

    return attendee || null;
  } catch (error) {
    console.error('Error getting registered attendee by user ID:', error);
    throw error;
  }
}

/**
 * Get attendee agenda slots (favorites + registered slots)
 * Returns array of slot IDs directly (matching old codebase)
 */
export async function getAttendeeAgendaSlots(contestantID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Get favorites (non-reg-item slots added to itinerary)
    const favoritesRequest = new sql.Request();
    favoritesRequest.input('contestantID', sql.Int, Number(contestantID));
    const favoritesResult = await favoritesRequest.query(`
      USE ${dbName};
      SELECT i.slot_id
      FROM contestantMyItinerary i
      INNER JOIN eventContestant ec ON ec.contestant_id = i.contestant_id
      WHERE i.contestant_id = @contestantID
    `);
    const favorites = favoritesResult.recordset.map(slot => slot.slot_id);

    // Get registered slots (reg-item slots)
    const regSlotsRequest = new sql.Request();
    regSlotsRequest.input('contestantID', sql.Int, Number(contestantID));
    const regSlotsResult = await regSlotsRequest.query(`
      USE ${dbName};
      SELECT st.slot_id
      FROM contestant_fees cf
      INNER JOIN scheduleTimes st ON st.eventFeeID = cf.eventFeeID
      WHERE cf.contestant_id = @contestantID
    `);
    const regItemSlots = regSlotsResult.recordset.map(slot => slot.slot_id);

    // Return combined array (matching old codebase)
    return [...favorites, ...regItemSlots];
  } catch (error) {
    console.error('Error getting attendee agenda slots:', error);
    throw error;
  }
}