/**
 * Event-related functions
 * Migrated from Mantle functions/events
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

/**
 * Update event (CEU fields only)
 */
export async function updateEvent(eventID, data, vert) {
  const connection = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const COLUMN_TYPES = {
    ceuAcronym: TYPES.VarChar,
    ceuDisplayOnReg: TYPES.Bit,
    ceuValueLabel: TYPES.VarChar,
    ceuDisplayCounterOnReg: TYPES.Bit
  };

  // Build update query
  const updateFields = Object.keys(data)
    .filter(key => key in COLUMN_TYPES)
    .map(key => `${key} = @${key}`)
    .join(', ');

  if (!updateFields) {
    throw new Error('No valid columns to update');
  }

  let updateRequest = connection.sql(`
    USE ${dbName};
    UPDATE b_events
    SET ${updateFields}
    WHERE event_id = @eventID;
  `)
  .parameter('eventID', TYPES.Int, Number(eventID));

  // Add parameters
  for (const key in data) {
    if (key in COLUMN_TYPES) {
      updateRequest = updateRequest.parameter(key, COLUMN_TYPES[key], data[key]);
    }
  }

  await updateRequest.execute();

  return data;
}

/**
 * Date and time to datetime conversion
 * Handles various date and time formats
 */
export async function dateAndTimeToDatetime(dateStr, timeStr) {
  if (!dateStr || !timeStr) {
    return null;
  }

  const moment = (await import('moment-timezone')).default;
  const _ = (await import('lodash')).default;

  let properDate = '';
  let properTime = '';
  let properDateTime = '';

  // Parse date - handle different formats
  if (String(dateStr).indexOf('/') >= 0) {
    properDate = moment(_.trim(dateStr), 'MM/DD/YYYY');
  } else if (String(dateStr).indexOf('-') >= 0) {
    properDate = moment(_.trim(dateStr), 'YYYY-MM-DD');
  } else {
    properDate = moment(_.trim(dateStr), 'DD MMM YYYY');
  }

  // Parse time - handle 12-hour format
  properTime = moment(_.trim(timeStr), 'hh:mm a');

  // Combine date and time
  properDateTime = moment({
    y: properDate.year(),
    M: properDate.month(),
    d: properDate.date(),
    h: properTime.hour(),
    m: properTime.minute(),
    s: properTime.second()
  });

  return properDateTime.format('YYYY-MM-DDTHH:mm:ss.SSS');
}

/**
 * Get events with registrants by affiliate
 */
export async function getEventsWithRegistrants(affiliateID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const events = await connection.sql(`
      USE ${dbName};
      SELECT 
          DISTINCT(e.event_id),
          e.event_title,
          e.event_begins
      FROM b_events e
      WHERE e.affiliate_id = @affiliateID
          AND EXISTS (select top 1 contestant_id from eventContestant where event_id = e.event_id)
      ORDER BY 
          e.event_begins desc,
          e.event_title
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

    return events;
  } catch (error) {
    console.error('Error getting events with registrants:', error);
    throw error;
  }
}

/**
 * Get event contacts by affiliate
 */
export async function getEventContactsByAffiliate(affiliateID, userID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const contacts = await connection.sql(`
      USE ${dbName};
      SELECT DISTINCT(event_email), event_contact
      FROM b_events
      WHERE affiliate_id = @affiliateID
          AND ISNULL(event_email,'') <> ''
          AND event_email <> (SELECT user_email FROM b_users WHERE user_id = @userID)
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .parameter('userID', TYPES.Int, Number(userID))
    .execute();

    return contacts;
  } catch (error) {
    console.error('Error getting event contacts by affiliate:', error);
    throw error;
  }
}

