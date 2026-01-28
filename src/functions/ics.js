/**
 * ICS (iCalendar) generation functions
 * Migrated from Mantle functions/ics
 */

import tz from '@touch4it/ical-timezones';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment-timezone';

/**
 * Create ICS calendar file content
 */
export async function createICS(
  startTime,
  endTime,
  title,
  description,
  location,
  contactName,
  contactEmail,
  zoneName,
  vert
) {
  // Make moment object from our UTC dates
  let start = moment.utc(startTime, true);
  let end = moment.utc(endTime, true);

  // If there was a timezone, convert to that timezone
  if (zoneName && zoneName.length) {
    start = start.tz(zoneName);
    end = end.tz(zoneName);
  }

  // Use GMT/UTC with DST definitions if no zonename provided
  if (!zoneName || !zoneName.length) {
    zoneName = 'UTC';
  }

  // Build out the ICS file contents
  let icsData = '';
  icsData += 'BEGIN:VCALENDAR\r';
  icsData += 'VERSION:2.0\r';
  icsData += 'METHOD:Publish\r';
  icsData += 'CALSCALE:GREGORIAN\r';
  icsData += `PRODID:-//Eventsquid/${vert}//NONSGML v1.0//EN\r`;
  icsData += tz.getVtimezoneComponent(zoneName);
  icsData += `BEGIN:VEVENT\r`;
  icsData += `UID:${uuidv4()}\r`;
  icsData += `DTSTAMP:${moment().format('YYYYMMDDTHHmmss')}\r`;
  icsData += `LOCATION:${location}\r`;
  icsData += `ORGANIZER;CN=${contactName}:MAILTO:${contactEmail}\r`;
  icsData += `DTSTART;TZID=${zoneName}:${start.format('YYYYMMDDTHHmmss')}${start.isUTC() ? 'Z' : ''}\r`;
  icsData += `DTEND;TZID=${zoneName}:${end.format('YYYYMMDDTHHmmss')}${end.isUTC() ? 'Z' : ''}\r`;
  icsData += `SUMMARY:${title}\r`;
  icsData += `DESCRIPTION:${
    (description || '')
      .replace(/\\/gm, '\\\\')
      .replace(/\r?\n/gm, '\\n')
      .replace(/;/gm, '\\;')
      .replace(/,/gm, '\\,')
  }\r`;
  icsData += `END:VEVENT\r`;
  icsData += `END:VCALENDAR\r`;

  return icsData;
}

/**
 * Get event calendar description info (VEO link)
 */
export async function getEventCalendarDescInfo(eventID, vert) {
  const { getConnection, getDatabaseName, TYPES } = await import('../utils/mssql.js');
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  // Domain names by vertical
  const DOMAINS_BY_VERTICAL = {
    cn: 'https://www.connectmeetings.events',
    es: 'https://www.eventsquid.com',
    fd: 'https://www.rcnation.com',
    ft: 'https://www.fitsquid.com',
    ir: 'https://inreachce.events',
    kt: 'https://app.mykindercamps.com',
    ln: 'https://www.launchsquid.com'
  };

  const request = new sql.Request();
  request.input('eventID', sql.Int, Number(eventID));
  const result = await request.query(`
    USE ${dbName};
    SELECT
        e._guid AS eventGUID,
        CASE v.veoMiscLinkInCalendar
            WHEN 1 THEN ISNULL(v.veoMiscLinkInCalendarLabel, 'Virtual Meeting Access')
            ELSE ''
        END AS veoCalLabel
    FROM b_events e 
    LEFT JOIN veo_options v ON v.eventGuid = e._guid
    WHERE e.event_id = @eventID
  `);
  const eventCalInfo = result.recordset;

  if (!eventCalInfo.length) {
    return '';
  }

  const domain = DOMAINS_BY_VERTICAL[vert.toLowerCase()] || DOMAINS_BY_VERTICAL.es;
  const veoCalLink = `${domain}/_mantle/veo/index.cfm?eg=${eventCalInfo[0].eventGUID}`;
  const veoCalString = eventCalInfo[0].veoCalLabel 
    ? ` ${eventCalInfo[0].veoCalLabel}: ${veoCalLink}` 
    : '';

  return veoCalString;
}

/**
 * Get event fee code
 */
export async function getEventFeeCode(eventFeeID, vert) {
  const { getConnection, getDatabaseName, TYPES } = await import('../utils/mssql.js');
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const request = new sql.Request();
  request.input('eventFeeID', sql.Int, Number(eventFeeID));
  const result = await request.query(`
    USE ${dbName};
    SELECT
        ISNULL(f.purchasedKey,'') AS prk
    FROM event_fees f
    WHERE eventFeeID = @eventFeeID
  `);
  const eventFee = result.recordset;

  return eventFee.length ? eventFee[0].prk : '';
}

