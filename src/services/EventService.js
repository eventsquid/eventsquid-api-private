/**
 * Event Service
 * Migrated from Mantle EventService.js
 * This is a placeholder - the full service is 2900+ lines and needs to be migrated incrementally
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
// Note: getConnection now returns sql module, use new sql.Request() for queries
import _ from 'lodash';
import moment from 'moment-timezone';
import axios from 'axios';

class EventService {
  /**
   * Column sets for different resultsets
   */
  getColumnSets() {
    return {
      "grouptool": {
        "columns": { "_id": 0, "e": 1, "et": 1, "a": 1, "an": 1 },
        "sort": { "et": 1, "e": 1 }
      },
      "grouptool-event": {
        "columns": { "_id": 0, "pfs": 1, "evfs": 1, "eq": 1, "eqo": 1 },
        "sort": { "et": 1, "e": 1 }
      }
    };
  }

  /**
   * Prepare event filter - removes empty values and converts strings to regex
   */
  async prepEventFilter(filterObj) {
    if (!filterObj) return {};

    const preparedFilter = { ...filterObj };

    // Loop through keys
    for (const key in preparedFilter) {
      if (preparedFilter.hasOwnProperty(key)) {
        // If this is an attendee/contestant or event id set to zero, remove it
        if (["c", "e"].indexOf(key) >= 0 && preparedFilter[key] === 0) {
          delete preparedFilter[key];
        }
        // If this is an empty string, remove it
        else if (typeof preparedFilter[key] === "string" && preparedFilter[key] === "") {
          delete preparedFilter[key];
        }
        // If this is a string, convert to regex for case-insensitive search
        else if (typeof preparedFilter[key] === "string") {
          preparedFilter[key] = new RegExp(preparedFilter[key], "i");
        }
      }
    }

    return preparedFilter;
  }

  /**
   * Prepare event results - post-processes results for specific resultsets
   */
  async prepEventResults(resultset, docs) {
    if (!docs || !Array.isArray(docs)) {
      return docs;
    }

    // For the event config in the new group tool
    if (resultset === "grouptool-event") {
      // This is complex restructuring logic - simplified version
      // Full implementation would restructure fees-by-cat and questions-with-options
      // For now, return docs as-is (full implementation can be added later)
      return docs;
    }

    return docs;
  }

  /**
   * Find events with filters
   */
  async findEvents(request) {
    try {
      const { filter, resultset } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!vert) {
        throw new Error('Vertical is required');
      }

      if (!resultset) {
        throw new Error('Resultset is required');
      }

      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');
      
      const columnSets = this.getColumnSets();
      const columnSet = columnSets[resultset];
      
      if (!columnSet) {
        throw new Error(`Unknown resultset: ${resultset}`);
      }

      // Prepare the filter
      const preparedFilter = await this.prepEventFilter(filter || {});

      // Find events
      const eventDocs = await eventsCollection
        .find(preparedFilter, { projection: columnSet.columns })
        .sort(columnSet.sort)
        .toArray();

      // Post-process results
      const processedResults = await this.prepEventResults(resultset, eventDocs);

      return processedResults;
    } catch (error) {
      console.error('Error finding events:', error);
      throw error;
    }
  }

  /**
   * Update custom prompts
   * Fetches custom prompts and options from MSSQL and updates MongoDB event record
   */
  async updateCustomPrompts(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');

      // Get prompts from MSSQL
      const promptsRequest = new sql.Request();
      promptsRequest.input('eventID', sql.Int, Number(eventID));
      const promptsResult = await promptsRequest.query(`
        USE ${dbName};
        SELECT DISTINCT
            RTRIM(LTRIM( cf.fieldLabel )) AS fl,
            cf.field_id AS fi,
            CASE WHEN ( cf.fieldInput != 'text' ) THEN 1 ELSE 0 END AS fo,
            ISNULL( cf.travelField, 0 ) AS tf,
            cf.fieldInput AS ft,
            CASE WHEN ( RTRIM(LTRIM( cf.fieldExportID )) = '' ) THEN NULL ELSE RTRIM(LTRIM( cf.fieldExportID )) END AS fx,
            CASE WHEN ( RTRIM(LTRIM( cf.optAttribute )) = '' ) THEN NULL ELSE RTRIM(LTRIM( cf.optAttribute )) END AS foa,
            cf.groupType AS fg,
            cf.hideFromCharts AS fh,
            JSON_QUERY((SELECT
                '[' + STUFF( (
                    SELECT ',' + CAST( c.bundle_id AS VARCHAR(32) )
                    FROM b_eventConfig c
                    WHERE
                    c.event_id = @eventID
                    AND
                    ISNULL(c.bundle_id,0) > 0
                    FOR XML PATH ('')
                ), 1, 1, '') + ']')) AS pfi
        FROM
            [b_events_to_custom_fields] AS ecf
                JOIN dbo.[Custom_Fields] AS cf ON ecf.[field_id] = cf.[field_id]
        WHERE
            event_id = @eventID
      `);
      const prompts = promptsResult.recordset;

      // Get options from MSSQL
      const optionsRequest = new sql.Request();
      optionsRequest.input('eventID', sql.Int, Number(eventID));
      const optionsResult = await optionsRequest.query(`
        USE ${dbName};
        SELECT DISTINCT
            cfo.[field_ID] AS fid,
            RTRIM(LTRIM( cfo.optionLabel )) AS ol,
            RTRIM(LTRIM( cfo.optionValue )) AS ov,
            ISNULL( cfo.optionOrder, 0 ) AS oo,
            cfo.[option_id] AS id
        FROM
            [b_events_to_custom_fields] AS ecf
            JOIN dbo.[custom_fieldOptions] AS cfo ON ecf.[field_id] = cfo.[field_ID]
        WHERE
            event_id = @eventID
        ORDER BY ISNULL( cfo.optionOrder, 0 )
      `);
      const options = optionsResult.recordset;

      // Parse JSON in prompts
      prompts.forEach(row => {
        if (row.pfi) {
          try {
            row.pfi = JSON.parse(row.pfi);
          } catch (e) {
            row.pfi = [];
          }
        } else {
          row.pfi = [];
        }
      });

      // Update the event record in MongoDB
      const result = await eventsCollection.updateOne(
        { e: Number(eventID) },
        {
          $currentDate: { lu: { $type: 'date' } },
          $set: { eq: prompts, eqo: options }
        }
      );

      return result;
    } catch (error) {
      console.error('Error updating custom prompts:', error);
      throw error;
    }
  }

  /**
   * Get event data by GUID
   * Helper method to get event data with specific columns
   */
  async getEventDataByGUID(eventGUID, columns, vert) {
    try {
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');

      const event = await eventsCollection.findOne(
        { eg: String(eventGUID) },
        { projection: columns }
      );

      return event;
    } catch (error) {
      console.error('Error getting event data by GUID:', error);
      throw error;
    }
  }

  /**
   * Get event timezone data
   * Returns timezone info for event and all fees
   */
  async getEventTimezoneData(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get event timezone
      const eventZoneRequest = new sql.Request();
      eventZoneRequest.input('eventID', sql.Int, Number(eventID));
      const eventZoneResult = await eventZoneRequest.query(`
        USE ${dbName};
        SELECT TOP 1
            ISNULL(tz.zoneName, '') zoneName
        FROM b_events e
        LEFT JOIN b_timezones tz on tz.timeZoneID = e.timeZone_id
        WHERE event_id = @eventID
      `);

      const eventZone = eventZoneResult.recordset.length ? eventZoneResult.recordset[0].zoneName : '';

      // Get fee timezones
      const feeZonesRequest = new sql.Request();
      feeZonesRequest.input('eventID', sql.Int, Number(eventID));
      const feeZonesResult = await feeZonesRequest.query(`
        USE ${dbName};
        SELECT
            ef.eventFeeID,
            ISNULL(tz.zoneName, '') zoneName,
            ISNULL(tz.timeZone, '') timeZone
        FROM event_fees ef
        LEFT JOIN b_timezones tz on tz.timeZoneID = ef.timeZone_id
        WHERE ef.event_id = @eventID
      `);

      // Build fees timezone object
      const feeZones = {};
      feeZonesResult.recordset.forEach(feeRecord => {
        feeZones[feeRecord.eventFeeID] = 
          (feeRecord.zoneName.length || feeRecord.timeZone === 'GMT') 
            ? feeRecord.zoneName 
            : eventZone;
      });

      return {
        zoneName: eventZone,
        fees: feeZones
      };
    } catch (error) {
      console.error('Error getting event timezone data:', error);
      throw error;
    }
  }

  /**
   * Get event data
   */
  async getEventData(request) {
    try {
      const { eventID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!eventID || !vert) {
        throw new Error('Event ID and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');
      const verticalsCollection = await getDatabase(null, 'cm');
      const configVerticalsCollection = verticalsCollection.collection('config-verticals');

      // Get event from MongoDB
      const event = await eventsCollection.findOne({ '_id.e': Number(eventID) });
      
      if (!event) {
        throw new Error('Event not found');
      }

      // Get S3 path from constants (we'll need to add this to env or config)
      event.s3path = process.env.S3_BASE_URL || 'https://s3-us-west-2.amazonaws.com/eventsquid/';

      // Get vertical config for s3domain
      try {
        const vertical = await configVerticalsCollection.findOne({ mongoID: String(vert) });
        if (vertical) {
          event.s3domain = vertical.s3domain;
        }
      } catch (error) {
        // In local dev, silently skip s3domain if we can't access cm database
        if (process.env.NODE_ENV === 'development' && 
            (error.code === 13 || error.message?.includes('not authorized'))) {
          // Silently continue without s3domain
        } else {
          throw error;
        }
      }

      return event;
    } catch (error) {
      console.error('Error getting event data:', error);
      throw error;
    }
  }

  /**
   * Get event profiles
   */
  async getEventProfiles(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT *
        FROM event_fee_bundles
        WHERE event_id = @eventID
        ORDER BY bundle_name
      `);
      const profiles = result.recordset;

      // In local dev, if MSSQL is unavailable and we get empty results, provide helpful message
      if (process.env.NODE_ENV === 'development' && (!profiles || profiles.length === 0)) {
        // Check if this is likely a mock connection (MSSQL unavailable)
        // The mock connection returns empty arrays, so if we get empty results in dev,
        // it's likely because MSSQL isn't accessible
        console.warn(`⚠️  getEventProfiles returned empty results for event ${eventID}. This endpoint requires MSSQL access.`);
        console.warn('   In local dev, MSSQL is unavailable, so this endpoint will return empty data.');
        console.warn('   To get real data, you need access to the MSSQL database.');
      }

      return profiles;
    } catch (error) {
      console.error('Error getting event profiles:', error);
      throw error;
    }
  }

  /**
   * Update event
   * Updates CEU-related fields in MSSQL
   */
  async updateEvent(eventID, body, vert) {
    try {
      const { updateEvent: updateEventFunc } = await import('../functions/events.js');
      const result = await updateEventFunc(eventID, body, vert);
      return result;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  /**
   * Get event duration
   */
  async getEventDuration(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get timezone
      const zoneRequest = new sql.Request();
      zoneRequest.input('eventID', sql.Int, Number(eventID));
      const zoneResult = await zoneRequest.query(`
        USE ${dbName};
        SELECT TOP 1
            ISNULL(tz.zoneName, '') zoneName
        FROM b_events e
        LEFT JOIN b_timezones tz on tz.timeZoneID = e.timeZone_id
        WHERE event_id = @eventID
      `);
      
      const eventZone = zoneResult.recordset.length ? zoneResult.recordset[0].zoneName : '';

      // Get event dates
      const eventRequest = new sql.Request();
      eventRequest.input('eventID', sql.Int, Number(eventID));
      const eventResult = await eventRequest.query(`
        USE ${dbName};
        SELECT
            e.event_begins,
            e.event_ends,
            e.startTime,
            e.endTime
        FROM b_events e
        WHERE event_id = @eventID
      `);

      if (!eventResult.recordset.length) {
        return {
          zoneName: eventZone,
          eventBegins: '',
          eventEnds: '',
          eventBeginsTime: '',
          eventEndsTime: ''
        };
      }

      const event = eventResult.recordset[0];
      return {
        zoneName: eventZone,
        eventBegins: event.event_begins ? event.event_begins.toISOString().split('T')[0] : '',
        eventEnds: event.event_ends ? event.event_ends.toISOString().split('T')[0] : '',
        eventBeginsTime: event.startTime || '',
        eventEndsTime: event.endTime || ''
      };
    } catch (error) {
      console.error('Error getting event duration:', error);
      throw error;
    }
  }

  /**
   * Update event timezone data
   * Uses external TimeZoneDB API to get timezone information
   */
  async updateEventTimezoneData(eventGUID, vert) {
    try {
      const dbName = getDatabaseName(vert);

      // Get event start date & timezone
      const eventData = await this.getEventDataByGUID(eventGUID, { e: 1, ebi: 1 }, vert);
      if (!eventData) {
        throw new Error('Event not found');
      }

      // Get the timezone
      const tzData = await this.getEventTimezoneData(eventData.e, vert);
      let zoneName = tzData.zoneName;

      if (zoneName === 'Greenwich Mean Time') {
        zoneName = 'GMT';
      }

      // Get startDate in UTC and Unix format
      let startDate = moment.utc(eventData.ebi);
      if (zoneName && zoneName.length) {
        startDate = startDate.tz(zoneName, true).utc();
      }

      const startDateUnix = startDate.unix();

      // Get timezone config from TimeZoneDB API
      if (!process.env.TIMEZONEDB_API_KEY) {
        throw new Error('TIMEZONEDB_API_KEY environment variable is required');
      }

      const tzConfigs = await axios.request({
        url: `http://vip.timezonedb.com/v2.1/get-time-zone?key=${process.env.TIMEZONEDB_API_KEY}&format=json&by=zone&zone=${zoneName}&time=${startDateUnix}`,
        method: 'get'
      }).then(response => {
        response.data.dst = Number(response.data.dst);
        return response.data;
      });

      const dstStart = tzConfigs.dst 
        ? moment.unix(tzConfigs.zoneStart).utc() 
        : moment.unix(tzConfigs.zoneEnd).utc();
      const dstEnd = tzConfigs.dst 
        ? moment.unix(tzConfigs.zoneEnd).utc() 
        : moment.unix(tzConfigs.zoneStart).utc();

      // Update MSSQL
      const sql = await getConnection(vert);
      const request = new sql.Request();
      request.input('tzo', sql.Int, tzConfigs.gmtOffset / 3600);
      request.input('tzoGMT', sql.Int, Number(tzConfigs.gmtOffset));
      request.input('tzAbbr', sql.VarChar, tzConfigs.abbreviation);
      request.input('altTZAbbr', sql.VarChar, tzConfigs.nextAbbreviation);
      request.input('tzName', sql.VarChar, tzConfigs.zoneName);
      request.input('isDSTon', sql.Int, tzConfigs.dst);
      request.input('dstStart', sql.DateTime, new Date(dstStart.format()));
      request.input('dstEnd', sql.DateTime, new Date(dstEnd.format()));
      request.input('eventGUID', sql.VarChar, eventGUID);
      await request.query(`
        USE ${dbName};
        UPDATE b_events
        SET
            tzo = @tzo,
            tzoGMT = @tzoGMT,
            tzAbbr = @tzAbbr,
            altTZAbbr = @altTZAbbr,
            tzName = @tzName,
            isDSTon = @isDSTon,
            dstStart = @dstStart,
            dstEnd = @dstEnd
        WHERE _guid = @eventGUID
      `);

      return { success: true, message: 'TZ Data Updated' };
    } catch (error) {
      console.error('Error updating event timezone data:', error);
      throw error;
    }
  }

  /**
   * Update fee timezone data
   * Similar to updateEventTimezoneData but for a specific fee
   */
  async updateFeeTimezoneData(eventGUID, eventFeeID, vert) {
    try {
      const dbName = getDatabaseName(vert);

      // Get event data to find the fee
      const eventData = await this.getEventDataByGUID(eventGUID, { e: 1, evfs: 1 }, vert);
      if (!eventData) {
        throw new Error('Event not found');
      }

      const fee = eventData.evfs?.find(f => f.f == eventFeeID);
      if (!fee || !fee.sd) {
        throw new Error('Fee not found or has no start date');
      }

      // Get timezone data
      const tzData = await this.getEventTimezoneData(eventData.e, vert);
      let zoneName = tzData.fees[eventFeeID] || tzData.zoneName;

      if (zoneName === 'Greenwich Mean Time') {
        zoneName = 'GMT';
      }

      // Get startDate in UTC and Unix format
      let startDate = moment.utc(fee.sd);
      if (zoneName && zoneName.length) {
        startDate = startDate.tz(zoneName, true).utc();
      }

      const startDateUnix = startDate.unix();

      // Get timezone config from TimeZoneDB API
      if (!process.env.TIMEZONEDB_API_KEY) {
        throw new Error('TIMEZONEDB_API_KEY environment variable is required');
      }

      const tzConfigs = await axios.request({
        url: `http://vip.timezonedb.com/v2.1/get-time-zone?key=${process.env.TIMEZONEDB_API_KEY}&format=json&by=zone&zone=${zoneName}&time=${startDateUnix}`,
        method: 'get'
      }).then(response => {
        response.data.dst = Number(response.data.dst);
        return response.data;
      });

      const dstStart = tzConfigs.dst 
        ? moment.unix(tzConfigs.zoneStart).utc() 
        : moment.unix(tzConfigs.zoneEnd).utc();
      const dstEnd = tzConfigs.dst 
        ? moment.unix(tzConfigs.zoneEnd).utc() 
        : moment.unix(tzConfigs.zoneStart).utc();

      // Update MSSQL
      const sql = await getConnection(vert);
      const request = new sql.Request();
      request.input('tzo', sql.Int, tzConfigs.gmtOffset / 3600);
      request.input('tzoGMT', sql.Int, Number(tzConfigs.gmtOffset));
      request.input('tzAbbr', sql.VarChar, tzConfigs.abbreviation);
      request.input('altTZAbbr', sql.VarChar, tzConfigs.nextAbbreviation);
      request.input('tzName', sql.VarChar, tzConfigs.zoneName);
      request.input('isDSTon', sql.Int, tzConfigs.dst);
      request.input('dstStart', sql.DateTime, new Date(dstStart.format()));
      request.input('dstEnd', sql.DateTime, new Date(dstEnd.format()));
      request.input('eventFeeID', sql.Int, Number(eventFeeID));
      await request.query(`
        USE ${dbName};
        UPDATE event_fees
        SET
            tzo = @tzo,
            tzoGMT = @tzoGMT,
            tzAbbr = @tzAbbr,
            altTZAbbr = @altTZAbbr,
            tzName = @tzName,
            isDSTon = @isDSTon,
            dstStart = @dstStart,
            dstEnd = @dstEnd
        WHERE eventFeeID = @eventFeeID
      `);

      return { success: true, message: 'Fee TZ Data Updated' };
    } catch (error) {
      console.error('Error updating fee timezone data:', error);
      throw error;
    }
  }

  /**
   * Sub-query: Get speaker attendee details
   */
  async subQrySpeakerAttendeeDetails(request, eventID, userID) {
    try {
      const dbName = getDatabaseName(request.headers?.vert || request.vert);
      const sql = await getConnection(request.headers?.vert || request.vert);

      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      request1.input('userID', sql.Int, Number(userID));
      const result = await request1.query(`
        USE ${dbName};
        SELECT
            contestant_id AS [c],
            _guid AS [cg],
            regTime AS [rt]
        FROM eventContestant
        WHERE event_id = @eventID
            AND regcomplete = 1
            AND user_id = @userID
      `);

      return result;
    } catch (error) {
      console.error('Error getting speaker attendee details:', error);
      throw error;
    }
  }

  /**
   * Sub-query: Get speaker schedule
   */
  async subQrySpeakerSchedule(request, eventID, speakerID) {
    try {
      const dbName = getDatabaseName(request.headers?.vert || request.vert);
      const sql = await getConnection(request.headers?.vert || request.vert);

      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      request1.input('speakerID', sql.Int, Number(speakerID));
      const result = await request1.query(`
        USE ${dbName};
        SELECT
            j.schedule_name AS [scn],
            j.timeSlotLength AS [tsl],
            j.schedule_id AS [sci],
            j.startDate AS [sd],
            j.endDate AS [end],
            js.slotDuration AS [ssd],
            dbo.udf_StripHTML( js.slotDescription ) AS [de],
            j.scheduleOrder AS [or],
            js.slot_id AS [sli],
            js.slottitle AS [slt],
            js.time_slot AS [tst],
            js.date_slot AS [ds],
            js.location AS [vlc],
            js.startDateISO AS [ssu],
            js.startDateUTC AS [ssi],
            CASE
                WHEN ISNULL(v.venue_name,'') = '' THEN
                    (SELECT venue_name
                     FROM b_venues v JOIN b_events e ON e.venue_id = v.venue_id
                     WHERE event_id = @eventID)
                ELSE v.venue_name
            END +
            CASE
                WHEN ISNULL(r.roomName,'') = '' THEN ''
                ELSE ' - ' + r.roomName
            END AS [vlc]
        FROM schedules j
            INNER JOIN scheduleTimes js ON js.schedule_id = j.schedule_id
            INNER JOIN speakerSchedule ss ON ss.slot_id = js.slot_id
            LEFT JOIN b_venues v on v.venue_id = js.venue_id and isnull(js.venue_id,0) > 0
            LEFT JOIN b_rooms r on r.roomID = js.roomID and isnull(js.roomID,0) > 0
        WHERE
            ss.speaker_id = @speakerID
            AND js.event_id = @eventID
      `);

      return result;
    } catch (error) {
      console.error('Error getting speaker schedule:', error);
      throw error;
    }
  }

  /**
   * Sub-query: Get speaker documents
   */
  async subQrySpeakerDocs(request, eventID, speakerID) {
    try {
      const dbName = getDatabaseName(request.headers?.vert || request.vert);
      const sql = await getConnection(request.headers?.vert || request.vert);
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      request1.input('speakerID', sql.Int, Number(speakerID));
      const result = await request1.query(`
        USE ${dbName};
        SELECT
            ed.[doc_id] AS [d],
            ISNULL( ed.showonWebsite, 0 ) AS [dow],
            ISNULL( ed.showonMobile, 0 ) AS [dom],
            ISNULL( ed.displayAfterEventBegin, 0 ) AS [dab],
            ISNULL( ed.showAttendeesOnly, 0 ) AS [dao],
            ISNULL( ed.showCheckedinOnly, 0 ) AS [dco],
            uu.filename AS [fn],
            uu.uploadtitle AS [ut],
            uu.uploadType AS [utp],
            uu.uploadDate AS [udt],
            CASE WHEN ( LEFT( uu.filenameS3, 13 ) = 'Invalid file:' ) THEN NULL ELSE uu.filenameS3 END AS [f3],
            CASE WHEN ( LEFT( uu.thumbS3, 13 ) = 'Invalid file:' ) THEN NULL ELSE uu.thumbS3 END AS [th3],
            uu.uploadCategory AS [upc]
        FROM dbo.[user_uploads] AS uu
            INNER JOIN eventDocs ed ON uu.doc_id = ed.doc_id
                AND uu.deleted = 0
                AND uu.resource_type = 'document-upload'
        WHERE ed.speaker_id = @speakerID
            AND ed.event_id = @eventID
      `);

      return result;
    } catch (error) {
      console.error('Error getting speaker docs:', error);
      throw error;
    }
  }

  /**
   * Update event speakers
   * Fetches speakers from MSSQL and updates MongoDB event record
   */
  async updateEventSpeakers(request) {
    try {
      const { eventID } = request.pathParameters || {};
      const { domain, rooturl } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!eventID || !vert) {
        throw new Error('Event ID and vertical are required');
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');

      // Get speakers from MSSQL
      const getSpeakersSQL = `
        USE ${dbName};
        SELECT
            se.speaker_order AS [eso],
            se.designation AS [esg],
            dbo.udf_StripHTML( dbo.UrlDecode( se.speaker_description ) ) AS [de],
            se.speaker_id AS [si],
            s.speaker_name AS [nm],
            CASE WHEN ( ISNULL( s.speaker_photo, '' ) != '' ) THEN
                CASE WHEN ( LEFT( s.speaker_photo, 17 ) = 'speakerPhotoLarge' ) THEN
                    'https://www.' + @domain + '/speakerPhotos/' + s.speaker_photo
                ELSE
                    'https://' + LEFT( s.speaker_photo, CHARINDEX( '-', s.speaker_photo )-1 ) + '.' + @domain + '/s3c/' + s.speaker_photo
                END
            ELSE NULL END AS [ph],
            CASE WHEN ( ISNULL( s.speaker_photoS3, '' ) != '' ) THEN s.speaker_photoS3 ELSE NULL END AS [ph3],
            CASE WHEN ( ISNULL( s.speaker_thumb, '' ) != '' ) THEN
                CASE WHEN ( LEFT( s.speaker_thumb, 17 ) = 'speakerPhotoThumb' ) THEN
                    'https://www.' + @domain + '/speakerPhotos/' + s.speaker_thumb
                ELSE
                    'https://' + LEFT( s.speaker_thumb, CHARINDEX( '-', s.speaker_thumb )-1 ) + '.' + @domain + '/s3c/' + s.speaker_thumb
                END
            ELSE NULL END AS [th],
            CASE WHEN ( ISNULL( s.speaker_thumbS3, '' ) != '' ) THEN @rooturl + '/' + s.speaker_thumbS3 ELSE NULL END AS [th3],
            s.user_id AS [u],
            dbo.udf_StripHTML( dbo.UrlDecode( s.speaker_bio ) ) AS [bio],
            u.user_company AS [uc],
            u.user_position AS [upo],
            u._guid AS [ug]
        FROM b_speakers s
            INNER JOIN speakerEvent se ON se.speaker_id = s.speaker_id
                AND ISNULL( se.active, 0 ) = 1
                AND se.event_id = @eventID
            INNER JOIN b_events e ON e.event_id = se.event_id
            LEFT JOIN b_users u ON u.user_id = s.user_id
        WHERE se.event_id = @eventID
      `;

      const sql = await getConnection(vert);
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      request1.input('domain', sql.VarChar, String(domain || ''));
      request1.input('rooturl', sql.VarChar, String(rooturl || ''));
      const result1 = await request1.query(getSpeakersSQL);
      let getSpeakers = result1.recordset;

      // Process each speaker - get docs, attendee details, and schedule
      for (let i = 0; i < getSpeakers.length; i++) {
        // Get docs for this speaker
        getSpeakers[i].ed = await this.subQrySpeakerDocs(request, Number(eventID), getSpeakers[i].si);

        // Get attendee details for this speaker
        if (getSpeakers[i].u) {
          getSpeakers[i].sad = await this.subQrySpeakerAttendeeDetails(request, Number(eventID), getSpeakers[i].u);
        }

        // Get schedule for this speaker
        getSpeakers[i].sch = await this.subQrySpeakerSchedule(request, Number(eventID), getSpeakers[i].si);

        // Remove nulls
        getSpeakers[i] = _.omitBy(getSpeakers[i], _.isNull);
      }

      // Update the event record
      await eventsCollection.updateOne(
        { e: Number(eventID) },
        {
          $currentDate: { lu: { $type: 'date' } },
          $set: { spk: getSpeakers }
        }
      );

      return { success: true, speakerCount: getSpeakers.length };
    } catch (error) {
      console.error('Error updating event speakers:', error);
      throw error;
    }
  }

  /**
   * Update reg items
   * Fetches registration items from MSSQL and updates MongoDB event record
   * This is a complex method that combines data from multiple sources
   */
  async updateRegItems(request) {
    try {
      const { eventID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!eventID || !vert) {
        throw new Error('Event ID and vertical are required');
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');

      // Get registration items from MSSQL
      // Note: This is a simplified version - full implementation would include
      // quantities left, options, and meals which require additional queries
      const getItemsSQL = `
        USE ${dbName};
        SELECT
            f.eventFeeID AS f,
            ISNULL( f.customFeeName, ft.fee_name ) AS fm,
            ISNULL( f.fieldDataLabel, '' ) AS isp,
            dbo.udf_StripHTML( f.fee_notes ) AS de,
            REPLACE( REPLACE( CAST( f.fee_notes AS VARCHAR(MAX) ), '"', '\"' ), '&', '\&' ) AS dh,
            ft.fee_category AS fc,
            dbo.udf_StripHTML( fg.group_name ) AS fgn,
            fg.group_id AS gri,
            fg.group_order AS fgo,
            f.orderBy AS [for],
            f.fee_class AS fcs,
            s.sizes AS szs,
            f.triggerMeals AS mt,
            f.fee_price as pr,
            f.extras as evfx,
            f.itemPhotoS3 as bp3,
            f.itemPhotoThumbS3 as th3,
            CASE WHEN ( ISNULL( f.fee_disable, 0 ) = 0 )
                THEN 1
                ELSE 0
            END AS fa,
            ISNULL( f.minAge, 0 ) AS mna,
            ISNULL( f.maxAge, 0 ) AS mxa,
            f.classLimit AS il,
            'coming soon' AS ql,  -- Quantity Left
            f.custLimit AS ilr,
            f.hideFromCheckInApp,
            f.disableDecrementing,
            CAST(CAST(activityStart AS varchar(25)) + ' ' + activityStartTime AS datetime) AS sd,
            CAST(CAST(activityEnd AS varchar(25)) + ' ' + activityEndTime AS datetime) AS [end],
            f.activityStartTime AS ist,
            f.activityEndTime AS iet,
            f.customID as cid,
            fr.roomName AS rm,
            ftz.timeZone AS tzn,
            fvu.venue_city AS vc,
            fvu.venue_country AS vcy,
            fvu.venue_lat AS vlt,
            fvu.venue_long AS vlg,
            fvu.venue_name AS vm,
            fvu.venue_region AS vr,
            fvu.venue_address AS va,
            fvu.venue_directions AS vdi,
            'coming soon' AS op,  -- An array of Options for this Item
            'coming soon' AS efml  -- An array of meal options for this item
        FROM
            event_fees AS f
            LEFT JOIN event_fee_types AS ft ON f.fee_type_id = ft.fee_type_id
            LEFT JOIN event_fee_groups AS fg ON f.group_id = fg.group_id
            LEFT JOIN fee_size AS s ON f.eventFeeID = s.eventFeeID
            LEFT JOIN [b_timeZones] AS ftz ON ftz.timeZoneID = f.timeZone_id
            LEFT JOIN [b_venues] AS fvu ON fvu.venue_id = f.venue_id
            LEFT JOIN [b_rooms] AS fr ON fr.roomID = f.roomID
        WHERE
            f.event_id = @eventID
            AND ISNULL( f.invisible, 0 ) = 0
            AND ISNULL( f.showTo, 0 ) IN ( 0, 2 )
        ORDER BY
            f.eventFeeID
      `;

      const sql = await getConnection(vert);
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      const result1 = await request1.query(getItemsSQL);
      let getItems = result1.recordset;

      // Get quantities left, options, and meals
      const getItemsQL = await this.selectEventQuantitiesLeft(eventID, vert);
      const getItemsOP = await this.selectEventItemsOptions(eventID, vert);
      const getItemsEFML = await this.selectEventItemsMeals(eventID, vert);

      // Process items
      for (let i = 0; i < getItems.length; i++) {
        const thisFeeID = Number(getItems[i].f);

        // Fix the sizes
        if (getItems[i].szs) {
          getItems[i].szs = getItems[i].szs.split(',');
          
          // If this is an empty string (after split, check first element)
          if (getItems[i].szs.length === 1 && getItems[i].szs[0] === '') {
            // Make it null
            getItems[i].szs = null;
          } else {
            // Trim the value in the array
            getItems[i].szs = getItems[i].szs.map(s => s.trim());
          }
        }

        // Set quantity left from query results
        getItems[i].ql = 0;
        for (let ql = 0; ql < getItemsQL.length; ql++) {
          if (getItemsQL[ql].f === thisFeeID) {
            getItems[i].ql = Number(getItemsQL[ql].ql);
            break;
          }
        }

        // Get the options for this item
        getItems[i].op = [];
        for (let op = 0; op < getItemsOP.length; op++) {
          if (getItemsOP[op].f === thisFeeID) {
            getItems[i].op.push(getItemsOP[op]);
          }
        }
        
        // If the option is empty
        if (getItems[i].op.length === 0) {
          getItems[i].op = null;
        } else {
          // Remove nulls from each option
          for (let j = 0; j < getItems[i].op.length; j++) {
            getItems[i].op[j] = _.omitBy(getItems[i].op[j], _.isNull);
          }
        }

        // Get the meals for this item
        getItems[i].efml = [];
        for (let efml = 0; efml < getItemsEFML.length; efml++) {
          if (getItemsEFML[efml].f === thisFeeID) {
            getItems[i].efml.push(getItemsEFML[efml]);
          }
        }
        
        if (getItems[i].efml.length === 0) {
          getItems[i].efml = null;
        } else {
          // Remove nulls from each meal
          for (let j = 0; j < getItems[i].efml.length; j++) {
            getItems[i].efml[j] = _.omitBy(getItems[i].efml[j], _.isNull);
          }
        }

        // Remove any nulls from the main item
        getItems[i] = _.omitBy(getItems[i], _.isNull);
      }

      // Update the event record in MongoDB
      const result = await eventsCollection.updateOne(
        { e: Number(eventID) },
        {
          $currentDate: { lu: { $type: 'date' } },
          $set: { evfs: getItems }
        }
      );

      return result;
    } catch (error) {
      console.error('Error updating reg items:', error);
      throw error;
    }
  }

  /**
   * Select event quantities left
   */
  async selectEventQuantitiesLeft(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT
          e.eventFeeID AS f,
          CASE WHEN ( ISNULL( e.classLimit, 0 ) != 0 )
            THEN e.classLimit - SUM( p.quantity )
          ELSE
            NULL
          END AS ql
        FROM contestant_fees p
          INNER JOIN event_fees AS e ON
          e.eventFeeID = p.eventFeeID 
          JOIN eventContestant ec ON
          ec.contestant_id = p.contestant_id
        WHERE ec.event_id = @eventID
        AND
          ISNULL( p.scratchclass, 0 ) = 0
        AND (
          ( ec.regcomplete = 1 AND ISNULL( ec.fullscratch, 0 ) = 0 )
          OR
          (
            ISNULL( ec.regcomplete, 0 ) = 0
            AND ABS( DATEDIFF( mi, coalesce( ec.pendingCheckOut, '01/01/2090 12:45:00' ), getDate() ) ) < 10
          )
        )
        GROUP BY e.eventFeeID, e.classLimit
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error selecting event quantities left:', error);
      throw error;
    }
  }

  /**
   * Select event items options
   */
  async selectEventItemsOptions(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT
          fto.eventFeeID AS f,
          fto.subclassID AS s,  -- Subclass ID of this Option
          fto.optionID AS o,    -- ID of this Option
          fto.seriesEventFeeID AS sf,  -- Series ID of this Option
          efs.subClassName AS sn,  -- Subclass Name for this Option
          efs.subClassType AS sct,  -- Subclass Type for this Option
          efso.option_name AS [on]  -- Name of this Option
        FROM
          event_fee_to_options AS fto
          JOIN event_fee_subClasses AS efs
            ON fto.subclassID = efs.subClassID
          JOIN event_fee_subClassOptions AS efso
            ON efs.subClassID = efso.subClassID
            AND fto.optionID = efso.optionID
        WHERE
          fto.event_id = @eventID
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error selecting event items options:', error);
      throw error;
    }
  }

  /**
   * Select event items meals
   */
  async selectEventItemsMeals(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT
          f.eventFeeID AS f,
          m.meal_id AS m,  -- ID of this Meal
          RTRIM( LTRIM( m.meal_name ) ) AS mn,  -- Name of this Meal
          m.kosher AS mk,  -- Denotes if Meal is kosher
          m.vegan AS mv,  -- Denotes if Meal is vegan
          m.glutenfree AS mgf,  -- Denotes if Meal is gluten free
          m.noNuts AS mnn,  -- Denotes if Meal does not contain nuts
          m.containsNuts AS mcn,  -- Denotes if Meal does contain nuts
          m.noSeafood AS mns,  -- Denotes if Meal does not contain seafood
          m.noLactose AS mnl,  -- Denotes if Meal is lactose free
          m.noRedMeat AS mnr,  -- Denotes if Meal does not contain red meat
          m.noPork AS mnp,  -- Denotes if Meal does not contain pork
          m.vegetarian AS mvg,  -- Denotes if Meal is vegetarian
          m.pescatarian AS mp  -- Denotes if Meal is pescatarian
        FROM
          b_meals AS m
          INNER JOIN event_fees AS f ON ',' + f.triggerMeals + ',' LIKE '%,' + CAST( m.meal_id AS varchar(255) ) + ',%'
        WHERE
          m.event_id = @eventID
          -- Grabs all the meals in the CSV of mealIDs this event has
          AND ','+f.triggerMeals+',' LIKE '%,'+CAST(m.meal_id AS varchar)+',%'
        ORDER BY
          RTRIM( LTRIM( m.meal_name ) )
      `);

      return result.recordset;
    } catch (error) {
      console.error('Error selecting event items meals:', error);
      throw error;
    }
  }

  /**
   * Update timestamp
   * Flags sections of data within the event collection as having been modified
   */
  async updateTimestamp(request) {
    try {
      const { eventID } = request.pathParameters || {};
      const { key } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!eventID || !key || !vert) {
        throw new Error('Event ID, key, and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');
      const updateTS = new Date();
      const updateObj = {};
      updateObj[String(key)] = updateTS;

      await eventsCollection.updateOne(
        { e: Number(eventID) },
        { $set: updateObj }
      );

      return { success: true };
    } catch (error) {
      console.error('Error updating timestamp:', error);
      throw error;
    }
  }

  /**
   * Generate event ICS file
   */
  async generateEventICS(eventGUID, vert) {
    try {
      const { createICS } = await import('../functions/ics.js');
      const { getEventCalendarDescInfo } = await import('../functions/ics.js');

      // Get event data
      const eventData = await this.getEventDataByGUID(eventGUID, {
        e: 1,   // Event ID
        en: 1,  // Event Contact Name
        em: 1,  // Event Contact Email
        ebi: 1, // Event Begins ISO
        eei: 1, // Event Ends ISO
        et: 1,  // Event Title
        ecl: 1, // Calendar Summary
        de: 1,  // Description
        vm: 1,  // Venue Name
        va: 1,  // Venue Address
        vc: 1,  // Venue City
        vr: 1   // Venue State (region)
      }, vert);

      if (!eventData) {
        return { success: false, data: 'This event does not exist. Please contact the event admin.' };
      }

      // Get event fee code to append to event fee description
      const calDescString = await getEventCalendarDescInfo(eventData.e, vert);

      // Format dates
      const tzData = await this.getEventTimezoneData(eventData.e, vert);

      // Format location
      let location = `${eventData.vm || ''}`;
      if ((eventData.va && eventData.va.length) || (eventData.vc && eventData.vc.length) || (eventData.vr && eventData.vr.length)) {
        location = `${location} - ${eventData.va || ''} ${eventData.vc || ''} ${eventData.vr || ''}`.trim();
      }

      // Convert dates - they're UTC but really user-inputted dates with no zone info
      let startDate = moment.utc(eventData.ebi);
      let endDate = moment.utc(eventData.eei);

      let zoneName = tzData.zoneName;
      if (zoneName === 'Greenwich Mean Time') {
        zoneName = 'GMT';
      }

      if (zoneName && zoneName.length) {
        startDate = startDate.tz(zoneName, true).utc();
        endDate = endDate.tz(zoneName, true).utc();
      }

      const description = eventData.ecl 
        ? eventData.ecl + calDescString 
        : eventData.de 
          ? eventData.de.substring(0, 400) + calDescString 
          : calDescString;

      const data = await createICS(
        startDate.toISOString(),
        endDate.toISOString(),
        eventData.et,
        description,
        location,
        eventData.en,
        eventData.em,
        zoneName,
        vert
      );

      return { success: true, data };
    } catch (error) {
      console.error('Error generating event ICS:', error);
      return { success: false, data: `Error generating ICS: ${error.message}` };
    }
  }

  /**
   * Generate event fee ICS file
   */
  async generateEventFeeICS(eventGUID, eventFeeID, vert) {
    try {
      const { createICS } = await import('../functions/ics.js');
      const { getEventFeeCode } = await import('../functions/ics.js');

      // Get event data
      const eventData = await this.getEventDataByGUID(eventGUID, {
        e: 1, // Event ID
        en: 1, // Event Contact Name
        em: 1, // Event Contact Email
        vm: 1, // Venue Name
        va: 1, // Venue Address
        vc: 1, // Venue City
        vr: 1, // Venue State (region)
        evfs: 1
      }, vert);

      if (!eventData) {
        return { success: false, data: 'This event does not exist. Please contact the event admin.' };
      }

      // Find the fee
      const fee = eventData.evfs?.find(f => f.f == eventFeeID);

      if (!fee) {
        return { success: false, data: 'This registration item does not exist. Please contact the event admin.' };
      }

      if (!fee.sd) {
        return { success: false, data: 'This registration item has no time associated with it. Please contact the event admin.' };
      }

      if (!fee.end) {
        return { success: false, data: 'This registration item has no end date. Please contact the event admin.' };
      }

      // Get event fee code
      const feeCode = await getEventFeeCode(fee.f, vert);

      // Format dates
      const tzData = await this.getEventTimezoneData(eventData.e, vert);
      let tz = !tzData.fees[eventFeeID] || !tzData.fees[eventFeeID].length ? '' : tzData.fees[eventFeeID];

      if (tz === 'Greenwich Mean Time') {
        tz = 'GMT';
      }

      // Default to event's venue
      let location = `${eventData.vm || ''}`;
      if ((eventData.va && eventData.va.length) || (eventData.vc && eventData.vc.length) || (eventData.vr && eventData.vr.length)) {
        location = `${location} - ${eventData.va || ''} ${eventData.vc || ''} ${eventData.vr || ''}`.trim();
      }

      // If the fee has a location, use it
      if (fee.vm) {
        location = `${fee.vm}`;
        if ((fee.va && fee.va.length) || (fee.vc && fee.vc.length) || (fee.vr && fee.vr.length)) {
          location = `${location} - ${fee.va || ''} ${fee.vc || ''} ${fee.vr || ''}`.trim();
        }
      }

      let startDate = moment.utc(fee.sd);
      let endDate = moment.utc(fee.end);

      if (tz && tz.length) {
        startDate = startDate.tz(tz, true).utc();
        endDate = endDate.tz(tz, true).utc();
      }

      const description = fee.de 
        ? fee.de.substring(0, 400) + ' ' + feeCode 
        : feeCode;

      const data = await createICS(
        startDate.toISOString(),
        endDate.toISOString(),
        fee.fm,
        description,
        location,
        eventData.en,
        eventData.em,
        tz,
        vert
      );

      return { success: true, data };
    } catch (error) {
      console.error('Error generating fee ICS:', error);
      return { success: false, data: `Error generating ICS: ${error.message}` };
    }
  }

  /**
   * Get touch event queries - comprehensive data fetching for event sync
   * Fetches all event fields from MSSQL for syncing to MongoDB
   * This method queries all relevant tables to build a complete event document
   */
  async getTouchEventQueries(eventID, vert, connection, dbName, s3RootURL, siteURL) {
    // Main event data query - start with core fields we know exist
    // Additional fields can be added as needed
    const sql = await getConnection(vert);
    const request1 = new sql.Request();
    request1.input('eventID', sql.Int, Number(eventID));
    const result1 = await request1.query(`
      USE ${dbName};
      SELECT TOP 1
          -- Basic event identifiers
          e._guid AS eg,
          e.Event_id AS e,
          e.affiliate_id AS a,
          -- Event dates and times
          e.Event_begins AS eb,
          e.Event_ends AS ee,
          e.startTime AS est,
          e.endTime AS eet,
          -- Event information
          e.Event_title AS et,
          e.Event_description AS de,
          e.Event_contact AS en,
          e.Event_email AS em,
          e.Event_phone AS eph,
          -- Event logo S3 URL
          CASE WHEN (ISNULL(NULLIF(e.EventlogoS3, ''), '') = '')
            THEN a.logo
            ELSE
              CASE WHEN (LEFT(ISNULL(NULLIF(e.EventlogoS3, ''), ''), 5) = 'https')
                THEN e.EventlogoS3
              ELSE
                '${s3RootURL || ''}/' + e.EventlogoS3
              END
          END AS el3,
          -- Venue information
          e.venue_id AS vn,
          vu.venue_name AS vm,
          vu.venue_address AS va,
          vu.venue_city AS vc,
          vu.venue_region AS vr,
          vu.venue_lat AS vlt,
          vu.venue_long AS vlg,
          -- Timezone
          e.timeZone_id AS tz,
          ISNULL(tz.zoneName, 'UTC') AS tzn,
          -- Check-in app settings (from b_events)
          e.autoAdvance AS aa,
          e.autoAdvanceRevert AS aar,
          e.multiDayCheckIn AS mdc,
          -- Contact scan app settings (from b_events)
          e.scanAppActive AS saa,
          e.scanAppCode AS sac,
          -- CEU settings (from b_events)
          e.ceuAcronym AS ceua,
          e.ceuDisplayOnReg AS ceud,
          e.ceuValueLabel AS ceuv,
          e.ceuDisplayCounterOnReg AS ceuc,
          -- Timestamps
          getDate() AS lu
      FROM b_Events AS e
          LEFT JOIN b_venues AS vu ON vu.venue_id = e.venue_id
          LEFT JOIN b_timezones AS tz ON tz.timeZoneID = e.timeZone_id
          JOIN b_affiliates AS a ON a.affiliate_id = e.affiliate_id
      WHERE e.Event_id = @eventID
    `);

    if (!result1.recordset.length) {
      return null;
    }

    let eventData = result1.recordset[0];

    // Get affiliate name
    const request2 = new sql.Request();
    request2.input('affiliateID', sql.Int, Number(eventData.a));
    const result2 = await request2.query(`
      USE ${dbName};
      SELECT TOP 1 affiliate_name AS an
      FROM b_affiliates
      WHERE affiliate_id = @affiliateID
    `);

    if (result2.recordset.length) {
      eventData.an = result2.recordset[0].an;
    }

    // Get authority data
    const request3 = new sql.Request();
    request3.input('eventID', sql.Int, Number(eventID));
    const result3 = await request3.query(`
      USE ${dbName};
      SELECT ea.authority_id AS [at]
      FROM EventAuthority ea
      WHERE ea.Event_id = @eventID
    `);

    eventData.eat = result3.recordset.map(authority => authority.at);

    // Get profile data
    const request4 = new sql.Request();
    request4.input('eventID', sql.Int, Number(eventID));
    const result4 = await request4.query(`
      USE ${dbName};
      SELECT
          bundle_id AS p,
          RTRIM(LTRIM(bundle_name)) AS pn,
          _guid AS pg,
          ISNULL(needsApproval, 0) AS na
      FROM Event_fee_bundles AS ep
      WHERE ep.Event_id = @eventID
          AND ep.bundle_active = 1
      ORDER BY RTRIM(LTRIM(bundle_name))
    `);

    eventData.pfs = result4.recordset;

    // Get meal data
    const request5 = new sql.Request();
    request5.input('eventID', sql.Int, Number(eventID));
    const result5 = await request5.query(`
      USE ${dbName};
      SELECT
          m.meal_id AS m,
          RTRIM(LTRIM(m.meal_name)) AS mn,
          m.kosher AS mk,
          m.vegan AS mv,
          m.glutenfree AS mgf,
          m.noNuts AS mnn,
          m.containsNuts AS mcn,
          m.noSeafood AS mns,
          m.noLactose AS mnl,
          m.noRedMeat AS mnr,
          m.noPork AS mnp,
          m.vegetarian AS mvg,
          m.pescatarian AS mp
      FROM b_meals AS m
      WHERE m.event_id = @eventID
      ORDER BY RTRIM(LTRIM(m.meal_name))
    `);

    eventData.evml = result5.recordset;

    return eventData;
  }

  /**
   * Touch event (update last modified)
   * This is a complex method that syncs all event data from MSSQL to MongoDB
   * It performs a massive query and data transformation
   */
  async touchEvent(request) {
    try {
      const { eventID } = request.pathParameters || {};
      const { s3RootURL, siteURL } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!eventID || eventID == 0) {
        return { message: 'Invalid Event ID' };
      }

      if (!s3RootURL || !siteURL || !siteURL.length || !s3RootURL.length) {
        return { message: 'Missing data' };
      }

      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');
      const { dateAndTimeToDatetime } = await import('../functions/events.js');

      // Get comprehensive event data using getTouchEventQueries
      let eventData = await this.getTouchEventQueries(eventID, vert, null, dbName, s3RootURL, siteURL);

      if (!eventData) {
        return {
          status: 'fail',
          message: 'Event not found'
        };
      }

      // Geolocation data for mongo geospatial search
      if (eventData.vlg && eventData.vlt) {
        eventData.vlc = {
          type: 'Point',
          coordinates: [
            eventData.vlg,
            eventData.vlt
          ]
        };
      }

      // Mongo ID Object
      eventData._id = {
        s: vert,
        e: eventData.e,
        a: eventData.a,
        eb: eventData.eb,
        ee: eventData.ee
      };

      // Clean null/empty values and format data
      const cleanKeys = (data) => {
        let newObj = {};
        if (Array.isArray(data)) {
          newObj = [];
        }

        for (const key in data) {
          const value = data[key];
          if (!(value === null || value.toString() === '')) {
            if (value instanceof Date) {
              // Format date - remove empty timestamps
              const dateStr = value.toISOString();
              newObj[key] = dateStr.split('T')[1] !== '00:00:00.000Z'
                ? value
                : dateStr.split('T')[0];
            } else if (Array.isArray(value) || typeof value === 'object') {
              newObj[key] = cleanKeys(value);
            } else {
              // Convert boolean to 1/0
              if (value === true) {
                newObj[key] = 1;
              } else if (value === false) {
                newObj[key] = 0;
              } else {
                newObj[key] = value;
              }
            }
          }
        }
        return newObj;
      };

      eventData = cleanKeys(eventData);

      // Format additional fields
      eventData.eph = eventData.eph ? eventData.eph.toString() : '';
      
      // Only set eq/eqo to empty if they weren't populated by getTouchEventQueries
      if (!eventData.eq || !Array.isArray(eventData.eq) || eventData.eq.length === 0) {
        eventData.eq = [];
      }
      if (!eventData.eqo || !Array.isArray(eventData.eqo) || eventData.eqo.length === 0) {
        eventData.eqo = [];
      }
      
      // Process keywords if they exist
      if (eventData.ek && typeof eventData.ek === 'string') {
        eventData.ek = eventData.ek.split(',').map(item => item.replace(/\|\^\^\|/g, ''));
      } else if (!eventData.ek) {
        eventData.ek = [];
      }

      // Event start / end time - combine date and time in JavaScript (matching old code)
      if (eventData.est && eventData.eb) {
        eventData.ebi = await dateAndTimeToDatetime(eventData.eb, eventData.est);
      }
      if (eventData.eet && eventData.ee) {
        eventData.eei = await dateAndTimeToDatetime(eventData.ee, eventData.eet);
      }

      // Delete any existing record
      await eventsCollection.deleteOne({ '_id.s': vert, '_id.e': Number(eventID) });

      // Save the updated version
      await eventsCollection.insertOne(eventData);

      return {
        status: 'success',
        message: 'Event Updated',
        eventData: eventData
      };
    } catch (error) {
      console.error('Error touching event:', error);
      throw error;
    }
  }

  /**
   * Auto deactivate fees
   * Deactivates fees that are set to auto-disable and are past their end date
   */
  async autoDeactivateFees(request) {
    try {
      const { eventID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!eventID || !vert) {
        throw new Error('Event ID and vertical are required');
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');

      // Find fees that should be auto-deactivated
      const sql = await getConnection(vert);
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      const result1 = await request1.query(`
        USE ${dbName};
        SELECT eventFeeID
        FROM event_fees
        WHERE
            event_id = @eventID
            AND fee_disable <> 1
            AND autoInactive = 1
            AND isnull(activityEnd,'') <> '' 
            AND getDate() >= dateadd(d,1,activityEnd)
      `);
      const updateIDs = result1.recordset.map(r => r.eventFeeID);

      // If there are none, return early
      if (!updateIDs.length) {
        return { message: 'success', updateCount: 0 };
      }

      // Disable fees in SQL
      const request2 = new sql.Request();
      request2.input('eventID', sql.Int, Number(eventID));
      await request2.query(`
        USE ${dbName};
        UPDATE event_fees
        SET fee_disable = 1
        WHERE
            event_id = @eventID
            AND fee_disable <> 1
            AND autoInactive = 1
            AND isnull(activityEnd,'') <> '' 
            AND getDate() >= dateadd(d,1,activityEnd)
      `);

      // Update MongoDB event record
      const event = await eventsCollection.findOne({ '_id.e': Number(eventID) });
      
      if (event && event.evfs) {
        // Update fees in the evfs array
        const updatedFees = event.evfs.map(evf => {
          if (updateIDs.includes(evf.f)) {
            return { ...evf, fa: 0 }; // Set active to 0
          }
          return evf;
        });

        await eventsCollection.updateOne(
          { '_id.e': Number(eventID) },
          { $set: { evfs: updatedFees } }
        );
      }

      return { message: 'success', updateCount: updateIDs.length };
    } catch (error) {
      console.error('Error auto deactivating fees:', error);
      throw error;
    }
  }

  /**
   * Reset view counts
   */
  async resetViewCounts(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      await request.query(`
        USE ${dbName};
        UPDATE b_events
        SET 
            regFormCount = 0,
            event_count = 0
        WHERE event_id = @eventID
      `);

      return {
        message: 'Successfully reset view counts'
      };
    } catch (error) {
      console.error('Error resetting view counts:', error);
      throw error;
    }
  }

  /**
   * Get CEU config
   */
  async getCEUConfig(eventID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT TOP 1
            ceuAcronym,
            ceuDisplayOnReg,
            ceuValueLabel,
            ceuDisplayCounterOnReg
        FROM
            b_events
        WHERE
            event_id = @eventID
      `);
      const data = result.recordset[0] || {};

      // Convert boolean fields to numbers
      if (data) {
        data.ceuDisplayCounterOnReg = Number(data.ceuDisplayCounterOnReg || 0);
        data.ceuDisplayOnReg = Number(data.ceuDisplayOnReg || 0);
      }

      return data;
    } catch (error) {
      console.error('Error getting CEU config:', error);
      throw error;
    }
  }

  /**
   * Get event sponsor config
   */
  async getEventSponsorConfig(eventID, vert) {
    try {
      const { getEventSponsorConfig } = await import('../functions/events.js');
      return await getEventSponsorConfig(eventID, vert);
    } catch (error) {
      console.error('Error getting event sponsor config:', error);
      throw error;
    }
  }

  /**
   * Set event sponsor config
   */
  async setEventSponsorConfig(form, eventID, vert) {
    try {
      const { setEventSponsorConfig } = await import('../functions/events.js');
      return await setEventSponsorConfig(form, eventID, vert);
    } catch (error) {
      console.error('Error setting event sponsor config:', error);
      throw error;
    }
  }

  /**
   * Get grouped resources
   */
  async getGroupedResources(eventID, vert) {
    try {
      const { getEventResources } = await import('../functions/resources.js');
      const { getEventResourceCategories } = await import('../functions/resources.js');
      
      const resources = await getEventResources(eventID, [], vert);
      const resourceCategories = await getEventResourceCategories(eventID, vert);

      let categories = resourceCategories.map(category => ({
        name: category.name,
        id: category.id,
        sortOrder: category.sortOrder,
        items: resources.filter(resource => resource.category_id == category.id)
      }));

      categories = _.sortBy(categories, 'sortOrder');
      categories = categories.map(category => {
        category.items = _.sortBy(category.items, 'sortOrder');
        return category;
      });

      let ungrouped = _.sortBy(resources.filter(resource => Number(resource.category_id) === 0), 'sortOrder');

      return {
        ungrouped,
        categories
      };
    } catch (error) {
      console.error('Error getting grouped resources:', error);
      throw error;
    }
  }

  /**
   * Get resource sponsors
   */
  async getResourceSponsors(affiliate_id, vert) {
    try {
      const { getResourceSponsors } = await import('../functions/resources.js');
      return await getResourceSponsors(affiliate_id, vert);
    } catch (error) {
      console.error('Error getting resource sponsors:', error);
      throw error;
    }
  }

  /**
   * Delete event resource
   */
  async deleteEventResource(eventID, resourceID, vert) {
    try {
      const { deleteEventResource } = await import('../functions/resources.js');
      return await deleteEventResource(eventID, resourceID, vert);
    } catch (error) {
      console.error('Error deleting event resource:', error);
      throw error;
    }
  }

  /**
   * Update event resource
   */
  async updateEventResource(eventID, resourceID, field, value, vert) {
    try {
      const { updateEventResource } = await import('../functions/resources.js');
      return await updateEventResource(eventID, resourceID, field, value, vert);
    } catch (error) {
      console.error('Error updating event resource:', error);
      throw error;
    }
  }

  /**
   * Add document to event
   */
  async addDocumentToEvent(eventID, data, affiliateID, vert) {
    try {
      const { uploadS3 } = await import('../utils/s3.js');
      const { addEventResource } = await import('../functions/resources.js');
      const { addAffiliateResource } = await import('../functions/resources.js');

      const fileData = await uploadS3(
        data.file,
        data.s3domain || '',
        data.ext,
        data.type,
        ''
      );

      await addEventResource(eventID, {
        title: data.title,
        ext: data.ext,
        filename: fileData.name,
        category: data.category,
        type: 'document-upload'
      }, vert);

      if (data.saveToLibrary) {
        await addAffiliateResource(affiliateID, {
          title: data.title,
          ext: data.ext,
          filename: fileData.name,
          category: data.category,
          type: 'document-upload'
        }, vert);
      }

      return fileData;
    } catch (error) {
      console.error('Error adding document to event:', error);
      throw error;
    }
  }

  /**
   * Create resource category
   */
  async createResourceCategory(affiliate_id, event_id, name, vert) {
    try {
      const { createResourceCategory } = await import('../functions/resources.js');
      return await createResourceCategory(affiliate_id, event_id, name, vert);
    } catch (error) {
      console.error('Error creating resource category:', error);
      throw error;
    }
  }

  /**
   * Delete event resource category
   */
  async deleteEventResourceCategory(event_id, category_id, sortOrder, vert) {
    try {
      const { deleteEventResourceCategory } = await import('../functions/resources.js');
      return await deleteEventResourceCategory(event_id, category_id, sortOrder, vert);
    } catch (error) {
      console.error('Error deleting event resource category:', error);
      throw error;
    }
  }

  /**
   * Get event config
   * Helper method to get event configuration for form prompts
   */
  async getEventConfig(eventID, profileID, vert) {
    try {
      const dbName = getDatabaseName(vert);

      let qryStr = `
        USE ${dbName};
        SELECT
          ISNULL( biofield_req, 0 ) AS biofield_req,
          ISNULL( hotelfield_req, 0 ) AS hotelfield_req,
          ISNULL( companyfield_req, 0 ) AS companyfield_req,
          ISNULL( positionfield_req, 0 ) AS positionfield_req,
          ISNULL( departurefield_req, 0 ) AS departurefield_req,
          ISNULL( hotelcheckinoutfield_req, 0 ) AS hotelcheckinoutfield_req,
          ISNULL( needroomfield_req, 0 ) AS needroomfield_req,
          ISNULL( emergencyContactField_req, 0 ) AS emergencycontactfield_req,
          ISNULL( emergencyPhonefield_req, 0 ) AS emergencyphonefield_req,
          ISNULL( emergencyRelationfield_req, 0 ) AS emergencyrelationfield_req,
          ISNULL( birthdatefield_req, 0 ) AS birthdatefield_req,
          ISNULL( driverlicensefield_req, 0 ) AS driverlicensefield_req,
          ISNULL( travelMethodfield_req, 0 ) AS travelmethodfield_req,
          ISNULL( phonefield_req, 0 ) AS phonefield_req,
          ISNULL( mobilefield_req, 0 ) AS mobilefield_req,
          ISNULL( teamfield_req, 0 ) AS teamfield_req,
          ISNULL( genderField_req, 0 ) AS genderfield_req,
          ISNULL( addressField_req, 0 ) AS addressfield_req,
          ISNULL( ssnField_req, 0 ) AS ssnfield_req,
          ISNULL( companyAddressField_req, 0 ) AS companyaddressfield_req,
          ISNULL( companyShipAddressField_req, 0 ) AS companyshipaddressfield_req,
          ISNULL( suffixField_req, 0 ) AS suffixfield_req,
          ISNULL( titleField_req, 0 ) AS titlefield_req,
          ISNULL( showisspeaker, 0 ) AS showisspeaker,
          ISNULL( memberofaffiliateid, 0 ) AS memberofaffiliateid,
          ISNULL( roomtypelist, '' ) AS roomtypelist,
          ISNULL( bio_req, 0 ) AS bio_req,
          ISNULL( hotel_req, 0 ) AS hotel_req,
          CAST( ISNULL( company_req, 0 ) AS INT ) AS company_req,
          CAST( ISNULL( position_req, 0 ) AS INT ) AS position_req,
          CAST( ISNULL( departure_req, 0 ) AS INT ) AS departure_req,
          CAST( ISNULL( hotelcheckinout, 0 ) AS INT ) AS hotelcheckinout,
          ISNULL( needRoom, 0 ) AS needroom,
          ISNULL( birthdate_req, 0 ) AS birthdate_req,
          ISNULL( showTravelMethod, 0 ) AS showtravelmethod,
          ISNULL( phone_req, 0 ) AS phone_req,
          ISNULL( mobile_req, 0 ) AS mobile_req,
          ISNULL( team_req, 0 ) AS team_req,
          ISNULL( gender_req, 0 ) AS gender_req,
          ISNULL( address_req, 0 ) AS address_req,
          ISNULL( ssn_req, 0 ) AS ssn_req,
          ISNULL( companyAddress_req, 0 ) AS companyaddress_req,
          ISNULL( companyShipAddress_req, 0 ) AS companyshipaddress_req,
          ISNULL( suffix_req, 0 ) AS suffix_req,
          ISNULL( title_req, 0 ) AS title_req
      `;

      if (Number(profileID) > 0) {
        qryStr += `,
            '' AS mindatehotel,
            '' AS maxdatehotel
          FROM b_eventConfig ec
            LEFT JOIN b_requiredFields rf ON rf.bundle_id = ISNULL(ec.bundle_id,0)
              AND rf.event_id = ec.event_id
          WHERE ec.event_id = @eventID
            AND ISNULL(ec.bundle_ID,0) = @profileID
        `;
      } else {
        qryStr += `,
            ISNULL( mindatehotel, '' ) AS mindatehotel,
            ISNULL( maxdatehotel, '' ) AS maxdatehotel
          FROM b_events e
            LEFT JOIN b_requiredFields rf ON rf.event_id = e.event_id
              AND ISNULL(rf.bundle_ID,0) = 0
          WHERE e.event_id = @eventID
        `;
      }

      const sql = await getConnection(vert);
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      request1.input('profileID', sql.Int, Number(profileID));
      const result = await request1.query(qryStr);
      const results = result.recordset;

      return results;
    } catch (error) {
      console.error('Error getting event config:', error);
      throw error;
    }
  }

  /**
   * Save event standard prompts
   */
  async saveEventStandardPrompts(request) {
    try {
      const dbName = getDatabaseName(request.vert);
      const eventID = Number(request.pathParameters?.eventID);
      const profileID = Number(request.pathParameters?.profileID);
      const body = request.body || {};

      const validFields = [
        'address_req', 'addressfield_req', 'bio_req', 'biofield_req',
        'birthdate_req', 'birthdatefield_req', 'company_req', 'companyaddress_req',
        'companyaddressfield_req', 'companyfield_req', 'companyshipaddress_req',
        'companyshipaddressfield_req', 'departure_req', 'departurefield_req',
        'driverlicensefield_req', 'emergencycontactfield_req', 'emergencyphonefield_req',
        'emergencyrelationfield_req', 'gender_req', 'genderfield_req', 'hotel_req',
        'hotelcheckinout', 'hotelcheckinoutfield_req', 'hotelfield_req',
        'memberofaffiliateid', 'mobile_req', 'mobilefield_req', 'needroom',
        'needroomfield_req', 'phone_req', 'phonefield_req', 'position_req',
        'positionfield_req', 'roomtypelist', 'showisspeaker', 'showtravelmethod',
        'ssn_req', 'ssnfield_req', 'suffix_req', 'suffixfield_req', 'team_req',
        'teamfield_req', 'title_req', 'titlefield_req', 'travelmethodfield_req'
      ];

      const validSettings = ['enabled', 'required', 'maxdatehotel', 'mindatehotel', 'roomtypelist'];

      const isValidField = validFields.indexOf(body.name) >= 0 || validFields.indexOf(body.requiredName) >= 0;
      const isValidSetting = validSettings.indexOf(body.setting) >= 0;
      const isNumeric = !isNaN(Number(body.value));

      if (!isValidField || !isValidSetting) {
        return { error: 'invalid request' };
      }

      let qryStr = `USE ${dbName};`;

      // If this is changing the enabled setting
      if (body.setting === 'enabled') {
        if (profileID > 0) {
          qryStr += `
            UPDATE b_eventConfig
            SET ${body.name} = @value
            WHERE event_id = @eventID
              AND ISNULL( bundle_ID, 0 ) = @profileID
          `;
        } else {
          qryStr += `
            UPDATE b_events
            SET ${body.name} = @value
            WHERE event_id = @eventID
          `;
        }
      }
      // If this is the required setting
      else if (body.setting === 'required') {
        qryStr += `
          IF NOT EXISTS (
            SELECT event_id
            FROM b_requiredFields
            WHERE event_id = @eventID
              AND ISNULL( bundle_id, 0 ) = @profileID
          )
            BEGIN
              INSERT INTO b_requiredFields ( event_id, ${body.requiredName}, bundle_id )
              VALUES( @eventID, @value, @profileID )
            END
          ELSE
            BEGIN
              UPDATE b_requiredFields
              SET ${body.requiredName} = @value
              WHERE event_id = @eventID
                AND ISNULL( bundle_id, 0 ) = @profileID
            END
        `;
      }
      // If this is the maxdatehotel / mindatehotel setting
      else if (body.setting === 'maxdatehotel' || body.setting === 'mindatehotel') {
        qryStr += `
          UPDATE b_events
          SET ${body.setting} = @value
          WHERE event_id = @eventID
        `;
      }
      // If this is the roomtypelist setting
      else if (body.setting === 'roomtypelist') {
        if (profileID > 0) {
          qryStr += `
            UPDATE b_eventConfig
            SET roomtypelist = @value
            WHERE event_id = @eventID
              AND ISNULL( bundle_ID, 0 ) = @profileID
          `;
        } else {
          qryStr += `
            UPDATE b_events
            SET roomtypelist = @value
            WHERE event_id = @eventID
          `;
        }
      } else {
        return { error: 'invalid request' };
      }

      // Execute query based on value type
      const sql = await getConnection(request.vert);
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, eventID);
      request1.input('profileID', sql.Int, profileID);
      
      if (isNumeric) {
        request1.input('value', sql.Int, Number(body.value));
      } else if (body.setting === 'maxdatehotel' || body.setting === 'mindatehotel') {
        request1.input('value', sql.Date, body.value);
      } else {
        request1.input('value', sql.VarChar, String(body.value));
      }
      
      await request1.query(qryStr);

      return {
        qryStr: qryStr,
        eventID: eventID,
        profileID: profileID,
        value: body.value,
        valueType: typeof body.value
      };
    } catch (error) {
      console.error('Error saving event standard prompts:', error);
      throw error;
    }
  }

  /**
   * Save event custom prompts
   */
  async saveEventCustomPrompts(request) {
    try {
      const dbName = getDatabaseName(request.vert);
      const eventID = Number(request.pathParameters?.eventID);
      const profileID = Number(request.pathParameters?.profileID);
      const body = request.body || {};

      const validSettings = ['enabled', 'required', 'mindate', 'maxdate'];
      const isValidSetting = validSettings.indexOf(body.setting) >= 0;
      const isNumeric = !isNaN(Number(body.value));

      if (!isValidSetting) {
        return { error: 'invalid request' };
      }

      let qryStr = `USE ${dbName};`;

      // If this is changing the enabled setting
      if (body.setting === 'enabled') {
        // If this custom prompt is now enabled
        if (Number(body.value) > 0) {
          qryStr += `
            IF NOT EXISTS (
              SELECT event_id
              FROM b_events_to_custom_fields
              WHERE event_id = @eventID
                AND ISNULL( bundle_ID, 0 ) = @profileID
                AND ISNULL( field_ID, 0 ) = @fieldID
            )
              BEGIN
                INSERT INTO b_events_to_custom_fields ( event_id, bundle_id, field_id )
                VALUES ( @eventID, @profileID, @fieldID )
              END
          `;
        } else {
          qryStr += `
            DELETE FROM b_events_to_custom_fields
            WHERE event_id = @eventID
              AND ISNULL( bundle_ID, 0 ) = @profileID
              AND ISNULL( field_ID, 0 ) = @fieldID
          `;
        }
      }
      // If this is the required setting
      else if (body.setting === 'required') {
        qryStr += `
          UPDATE b_events_to_custom_fields
          SET isRequired = @value
          WHERE event_id = @eventID
            AND ISNULL( bundle_ID, 0 ) = @profileID
            AND ISNULL( field_ID, 0 ) = @fieldID
        `;
      }
      // If this is the maxdate / mindate setting
      else if (body.setting === 'maxdate' || body.setting === 'mindate') {
        qryStr += `
          UPDATE b_events_to_custom_fields
          SET ${body.setting} = @value
          WHERE event_id = @eventID
            AND ISNULL( bundle_ID, 0 ) = @profileID
            AND ISNULL( field_ID, 0 ) = @fieldID
        `;
      }

      // Execute query based on value type
      const sql = await getConnection(request.vert);
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, eventID);
      request1.input('profileID', sql.Int, profileID);
      request1.input('fieldID', sql.Int, Number(body.field_ID));
      
      if (isNumeric) {
        request1.input('value', sql.Int, Number(body.value));
      } else if (body.setting === 'maxdate' || body.setting === 'mindate') {
        request1.input('value', sql.Date, body.value);
      } else {
        request1.input('value', sql.VarChar, String(body.value));
      }
      
      await request1.query(qryStr);

      return {
        qryStr: qryStr,
        eventID: eventID,
        profileID: profileID,
        value: body.value,
        valueType: typeof body.value
      };
    } catch (error) {
      console.error('Error saving event custom prompts:', error);
      throw error;
    }
  }

  /**
   * Get recipient notifications
   */
  async getRecipientNotifications(request) {
    try {
      const eventID = Number(request.pathParameters?.eventID);
      const vert = request.headers?.vert || request.vert || '';
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const sqlRequest = new sql.Request();
      sqlRequest.input('eventID', sql.Int, eventID);
      const result = await sqlRequest.query(`
        USE ${dbName};
        SELECT *
        FROM event_notification
        WHERE event_id = @eventID
        ORDER BY notification_to
      `);

      return result.recordset || [];
    } catch (error) {
      console.error('Error getting recipient notifications:', error);
      throw error;
    }
  }

  /**
   * Add recipient notification
   */
  async addRecipientNotification(request) {
    try {
      const eventID = Number(request.pathParameters?.eventID);
      const vert = request.headers?.vert || request.vert || '';
      const body = request.body || {};
      const affiliateID = Number(request.session?.affiliate_id);

      if (!body.notificationEmail || !body.notificationName || body.notificationEmail === '' || body.notificationName === '') {
        return {
          status: 'fail',
          message: 'Please fill out all the required fields.'
        };
      }

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const sqlRequest = new sql.Request();
      sqlRequest.input('eventID', sql.Int, eventID);
      sqlRequest.input('notificationEmail', sql.VarChar, String(body.notificationEmail));
      sqlRequest.input('notificationType', sql.VarChar, String(body.notificationType || ''));
      sqlRequest.input('notificationName', sql.VarChar, String(body.notificationName));
      sqlRequest.input('affiliateID', sql.Int, affiliateID);
      
      const result = await sqlRequest.query(`
        USE ${dbName};
        IF NOT EXISTS (
          SELECT *
          FROM event_notification
          WHERE event_id = @eventID
            AND notification_email = @notificationEmail
        )
        BEGIN
          INSERT INTO event_notification (
            notification_email,
            event_id,
            notification_label,
            notification_to,
            affiliate_id
          ) VALUES (
            @notificationEmail,
            @eventID,
            @notificationType,
            @notificationName,
            @affiliateID
          );
          SELECT @@IDENTITY as id;
        END
      `);

      return {
        status: result.recordset && result.recordset.length ? 'success' : 'fail',
        message: result.recordset && result.recordset.length ? 'Recipient Added' : 'A recipient with that email already exists.'
      };
    } catch (error) {
      console.error('Error adding recipient notification:', error);
      return {
        status: 'fail',
        message: error.message
      };
    }
  }

  /**
   * Update recipient notification
   */
  async updateRecipientNotification(request) {
    try {
      const vert = request.headers?.vert || request.vert || '';
      const body = request.body || {};
      const affiliateID = Number(request.session?.affiliate_id);
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      let qryStr = `USE ${dbName};`;
      const sqlRequest = new sql.Request();
      sqlRequest.input('notificationID', sql.Int, Number(body.notificationID));
      sqlRequest.input('affiliateID', sql.Int, affiliateID);

      if (body.hasOwnProperty('cancelEmail')) {
        qryStr += `
          UPDATE event_notification
          SET cancel_email = @cancelEmail
          WHERE notification_id = @notificationID;
        `;
        sqlRequest.input('cancelEmail', sql.Int, Number(body.cancelEmail) || 0);
      }

      if (body.hasOwnProperty('sendData')) {
        qryStr += `
          UPDATE event_notification
          SET
            sendData = @sendData,
            sendDataCustom = @sendDataCustom,
            excludeBundleIDs = @excludeBundleIDs,
            notify3PFeeIDs = @notify3PFeeIDs,
            includeFeeIDs = @includeFeeIDs
          WHERE notification_id = @notificationID;
        `;
        sqlRequest.input('sendData', sql.VarChar, String(body.sendData || ''));
        sqlRequest.input('sendDataCustom', sql.VarChar, String(body.sendDataCustom || ''));
        sqlRequest.input('excludeBundleIDs', sql.VarChar, String(body.excludeBundleIDs || ''));
        sqlRequest.input('notify3PFeeIDs', sql.VarChar, String(body.notify3PFeeIDs || ''));
        sqlRequest.input('includeFeeIDs', sql.VarChar, String(body.includeFeeIDs || ''));
      }

      if (body.hasOwnProperty('pendingNotice')) {
        qryStr += `
          UPDATE event_notification
          SET pendingNotice = @pendingNotice
          WHERE notification_email = @notificationEmail
            AND affiliate_id = @affiliateID;
        `;
        sqlRequest.input('pendingNotice', sql.Int, Number(body.pendingNotice) || 0);
        sqlRequest.input('notificationEmail', sql.VarChar, String(body.notificationEmail || ''));
      }

      await sqlRequest.query(qryStr);

      return {
        status: 'success',
        message: 'Notification updated'
      };
    } catch (error) {
      console.error('Error updating recipient notification:', error);
      return {
        status: 'fail',
        message: error.message
      };
    }
  }

  /**
   * Delete recipient notification
   */
  async deleteRecipientNotification(request) {
    try {
      const notificationID = Number(request.pathParameters?.notificationID);
      const vert = request.headers?.vert || request.vert || '';
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const sqlRequest = new sql.Request();
      sqlRequest.input('notificationID', sql.Int, notificationID);
      await sqlRequest.query(`
        USE ${dbName};
        DELETE FROM event_notification
        WHERE notification_id = @notificationID
      `);

      return {
        status: 'success',
        message: 'Recipient Deleted'
      };
    } catch (error) {
      console.error('Error deleting recipient notification:', error);
      return {
        status: 'fail',
        message: error.message
      };
    }
  }

  /**
   * Get event details for notification setup
   */
  async getEventDetailsForNotificationSetup(request) {
    try {
      const eventID = Number(request.pathParameters?.eventID);
      const vert = request.headers?.vert || request.vert || '';
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Query fees
      const feeQry = `
        USE ${dbName};
        SELECT
          eft.fee_name,
          g.group_name,
          eft.fee_category,
          ef.customFeeName,
          ef.eventFeeID,
          "orderme" =
            CASE
              WHEN eft.fee_category = 'Registration' THEN 1
              WHEN eft.fee_category = 'Race' THEN 2
              WHEN eft.fee_category = 'Activity' THEN 3
              WHEN eft.fee_category = 'Facility' THEN 4
              WHEN eft.fee_category = 'Goods' THEN 5
              WHEN eft.fee_category = 'General' THEN 6
              WHEN eft.fee_category = 'Meals' THEN 7
              WHEN eft.fee_category = 'Membership' THEN 8
              WHEN eft.fee_category = 'Spectator' THEN 9
              WHEN eft.fee_category = 'Sponsorship' THEN 10
              ELSE 99
            END
        FROM event_fees ef
          INNER JOIN event_fee_types eft ON eft.fee_type_id = ef.fee_type_id
          LEFT JOIN event_fee_groups g ON g.group_id = ef.group_id
        WHERE ef.event_id = @eventID
          AND ISNULL(invisible, 0) = 0
          AND (ISNULL(ef.showTo, 0) IN (0, 2))
        ORDER BY
          orderme,
          ISNULL(g.group_order, 100),
          g.group_name,
          ef.orderby,
          ef.customFeeName,
          eft.fee_name,
          g.group_id
      `;

      // Query profiles
      const profileQry = `
        USE ${dbName};
        SELECT *
        FROM event_fee_bundles
        WHERE event_id = @eventID
      `;

      // Query event data
      const eventQry = `
        USE ${dbName};
        SELECT
          e.fullguest,
          a.allowBringing
        FROM b_events e
          INNER JOIN b_affiliates a ON a.affiliate_id = e.affiliate_id
        WHERE event_id = @eventID
      `;

      // Query custom prompts
      // Note: Only select ecf.field_id, not f.field_id (to avoid duplicate field_id)
      const customPromptQry = `
        USE ${dbName};
        SELECT
          ecf.field_id,
          ecf.bundle_id,
          f.fieldType,
          f.fieldInput,
          f.siteSection,
          f.groupType,
          f.fieldLabel
        FROM b_events_to_custom_fields ecf
          INNER JOIN custom_fields f ON f.field_id = ecf.field_id
        WHERE event_id = @eventID
        ORDER BY f.fieldLabel
      `;

      const sqlRequest1 = new sql.Request();
      sqlRequest1.input('eventID', sql.Int, eventID);
      const feesResult = await sqlRequest1.query(feeQry);

      const sqlRequest2 = new sql.Request();
      sqlRequest2.input('eventID', sql.Int, eventID);
      const profilesResult = await sqlRequest2.query(profileQry);

      const sqlRequest3 = new sql.Request();
      sqlRequest3.input('eventID', sql.Int, eventID);
      const eventResult = await sqlRequest3.query(eventQry);

      const sqlRequest4 = new sql.Request();
      sqlRequest4.input('eventID', sql.Int, eventID);
      const customPromptsResult = await sqlRequest4.query(customPromptQry);

      // Match old codebase: return in correct order with eventData as array and status
      // Order: profiles, fees, eventData, customPrompts, status
      return {
        profiles: profilesResult.recordset || [],
        fees: feesResult.recordset || [],
        eventData: eventResult.recordset || [],
        customPrompts: customPromptsResult.recordset || [],
        status: 'success'
      };
    } catch (error) {
      console.error('Error getting event details for notification setup:', error);
      throw error;
    }
  }
}

export default new EventService();

