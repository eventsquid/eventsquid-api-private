/**
 * Credits functions
 * Migrated from Mantle functions/credits
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

/**
 * Get credits by user ID
 */
export async function getCreditsByUserID(userID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('userID', sql.Int, Number(userID));
    const result = await request.query(`
      USE ${dbName};
      SELECT
          ef.ceuName as creditName,
          ef.eventFeeID as eventFeeID,
          e.event_title as eventName,
          e.event_begins as eventBeginDate,
          ef.customFeeName as feeName,
          cf.ceuAwarded as creditValue,
          a.affiliate_name as rewardedBy
      FROM contestant_fees cf
      LEFT JOIN eventContestant ec on ec.contestant_id = cf.contestant_id
      LEFT JOIN b_events e on e.event_id = cf.event_id
      LEFT JOIN event_fees ef on ef.eventFeeID = cf.eventFeeID
      LEFT JOIN b_affiliates a on a.affiliate_id = e.affiliate_id
      WHERE 
      cf.contestant_id IN (
          SELECT contestant_id 
          FROM eventContestant 
          WHERE user_id = @userID
      )
      AND cf.ceuAwarded > 0
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting credits by user ID:', error);
    throw error;
  }
}

/**
 * Get states
 */
export async function getStates() {
  try {
    // States are in EventsquidCommon database
    const sql = await getConnection(null);
    
    const request = new sql.Request();
    const result = await request.query(`
      USE EventsquidCommon;
      SELECT 
          s.id,
          s.abbreviation,
          s.name as name,
          c.countryID as country
      FROM States s
      LEFT JOIN Countries c on c.countryID = s.countryID
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting states:', error);
    throw error;
  }
}

/**
 * Filter attendees by profile
 */
export function filterAttendeesByProfile(attendees, profiles) {
  // NOTE: make sure param values are parsed correctly prior to calling this function
  if (!attendees || !attendees.length) return [];
  if (!profiles || !profiles.length) return attendees;

  const filteredAttendees = attendees.filter(attendee => {
    const profile = profiles.find(profile => profile.id === attendee.profileID);
    if (!profile) return false;
    return true;
  });

  return filteredAttendees;
}

/**
 * Filter attendees by jurisdiction
 */
export function filterAttendeesByJurisdiction(attendees, jurisdictions) {
  // NOTE: make sure param values are parsed correctly prior to calling this function
  if (!attendees || !attendees.length) return [];
  if (!jurisdictions || !jurisdictions.length) return attendees;

  const filteredAttendees = attendees.filter(attendee => {
    const jurisdiction = jurisdictions.find(jurisdiction => 
      jurisdiction.abbreviation === attendee.userState
    );
    if (!jurisdiction) return false;
    return true;
  });

  return filteredAttendees;
}

