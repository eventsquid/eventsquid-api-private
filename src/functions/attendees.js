/**
 * Attendee functions
 * Migrated from Mantle functions/attendees
 */

import { getDatabase } from '../utils/mongodb.js';

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

