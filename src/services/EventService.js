/**
 * Event Service
 * Migrated from Mantle EventService.js
 * This is a placeholder - the full service is 2900+ lines and needs to be migrated incrementally
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');

      // Get prompts from MSSQL
      const prompts = await connection.sql(`
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
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      // Get options from MSSQL
      const options = await connection.sql(`
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
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get event timezone
      const eventZoneResult = await connection.sql(`
        USE ${dbName};
        SELECT TOP 1
            ISNULL(tz.zoneName, '') zoneName
        FROM b_events e
        LEFT JOIN b_timezones tz on tz.timeZoneID = e.timeZone_id
        WHERE event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      const eventZone = eventZoneResult.length ? eventZoneResult[0].zoneName : '';

      // Get fee timezones
      const feeZonesResult = await connection.sql(`
        USE ${dbName};
        SELECT
            ef.eventFeeID,
            ISNULL(tz.zoneName, '') zoneName,
            ISNULL(tz.timeZone, '') timeZone
        FROM event_fees ef
        LEFT JOIN b_timezones tz on tz.timeZoneID = ef.timeZone_id
        WHERE ef.event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      // Build fees timezone object
      const feeZones = {};
      feeZonesResult.forEach(feeRecord => {
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
      const vertical = await configVerticalsCollection.findOne({ mongoID: String(vert) });
      if (vertical) {
        event.s3domain = vertical.s3domain;
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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const profiles = await connection.sql(`
        USE ${dbName};
        SELECT *
        FROM event_fee_bundles
        WHERE event_id = @eventID
        ORDER BY bundle_name
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get timezone
      const zoneResult = await connection.sql(`
        USE ${dbName};
        SELECT TOP 1
            ISNULL(tz.zoneName, '') zoneName
        FROM b_events e
        LEFT JOIN b_timezones tz on tz.timeZoneID = e.timeZone_id
        WHERE event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();
      
      const eventZone = zoneResult.length ? zoneResult[0].zoneName : '';

      // Get event dates
      const eventResult = await connection.sql(`
        USE ${dbName};
        SELECT
            e.event_begins,
            e.event_ends,
            e.startTime,
            e.endTime
        FROM b_events e
        WHERE event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      if (!eventResult.length) {
        return {
          zoneName: eventZone,
          eventBegins: '',
          eventEnds: '',
          eventBeginsTime: '',
          eventEndsTime: ''
        };
      }

      const event = eventResult[0];
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
      const connection = await getConnection(vert);
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
      await connection.sql(`
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
      `)
      .parameter('tzo', TYPES.Int, tzConfigs.gmtOffset / 3600)
      .parameter('tzoGMT', TYPES.Int, Number(tzConfigs.gmtOffset))
      .parameter('tzAbbr', TYPES.VarChar, tzConfigs.abbreviation)
      .parameter('altTZAbbr', TYPES.VarChar, tzConfigs.nextAbbreviation)
      .parameter('tzName', TYPES.VarChar, tzConfigs.zoneName)
      .parameter('isDSTon', TYPES.Int, tzConfigs.dst)
      .parameter('dstStart', TYPES.DateTime, new Date(dstStart.format()))
      .parameter('dstEnd', TYPES.DateTime, new Date(dstEnd.format()))
      .parameter('eventGUID', TYPES.VarChar, eventGUID)
      .execute();

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
      const connection = await getConnection(vert);
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
      await connection.sql(`
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
      `)
      .parameter('tzo', TYPES.Int, tzConfigs.gmtOffset / 3600)
      .parameter('tzoGMT', TYPES.Int, Number(tzConfigs.gmtOffset))
      .parameter('tzAbbr', TYPES.VarChar, tzConfigs.abbreviation)
      .parameter('altTZAbbr', TYPES.VarChar, tzConfigs.nextAbbreviation)
      .parameter('tzName', TYPES.VarChar, tzConfigs.zoneName)
      .parameter('isDSTon', TYPES.Int, tzConfigs.dst)
      .parameter('dstStart', TYPES.DateTime, new Date(dstStart.format()))
      .parameter('dstEnd', TYPES.DateTime, new Date(dstEnd.format()))
      .parameter('eventFeeID', TYPES.Int, Number(eventFeeID))
      .execute();

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
      const connection = await getConnection(request.headers?.vert || request.vert);
      const dbName = getDatabaseName(request.headers?.vert || request.vert);

      const result = await connection.sql(`
        USE ${dbName};
        SELECT
            contestant_id AS [c],
            _guid AS [cg],
            regTime AS [rt]
        FROM eventContestant
        WHERE event_id = @eventID
            AND regcomplete = 1
            AND user_id = @userID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('userID', TYPES.Int, Number(userID))
      .execute();

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
      const connection = await getConnection(request.headers?.vert || request.vert);
      const dbName = getDatabaseName(request.headers?.vert || request.vert);

      const result = await connection.sql(`
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
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('speakerID', TYPES.Int, Number(speakerID))
      .execute();

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
      const connection = await getConnection(request.headers?.vert || request.vert);
      const dbName = getDatabaseName(request.headers?.vert || request.vert);

      const result = await connection.sql(`
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
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('speakerID', TYPES.Int, Number(speakerID))
      .execute();

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

      let getSpeakers = await connection.sql(getSpeakersSQL)
        .parameter('eventID', TYPES.Int, Number(eventID))
        .parameter('domain', TYPES.VarChar, String(domain || ''))
        .parameter('rooturl', TYPES.VarChar, String(rooturl || ''))
        .execute();

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
            fvu.venue_directions AS vdi
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

      let getItems = await connection.sql(getItemsSQL)
        .parameter('eventID', TYPES.Int, Number(eventID))
        .execute();

      // Process items
      for (let i = 0; i < getItems.length; i++) {
        // Process sizes
        if (getItems[i].szs) {
          const sizes = getItems[i].szs.split(',');
          if (sizes.length === 1 && sizes[0] === '') {
            getItems[i].szs = null;
          } else {
            getItems[i].szs = sizes.map(s => s.trim());
          }
        }

        // Set default quantity left (would be calculated from additional query)
        getItems[i].ql = 0;

        // Set default options and meals (would be populated from additional queries)
        getItems[i].op = null;
        getItems[i].efml = null;

        // Remove null values
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
   * Touch event (update last modified)
   * This is a complex method that syncs all event data from MSSQL to MongoDB
   * It performs a massive query and data transformation
   * Note: This is a simplified version - full implementation would include all fields from getTouchEventQueries
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

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');
      const { dateAndTimeToDatetime } = await import('../functions/events.js');

      // Get touch event queries (simplified - full version would have all fields)
      // For now, we'll do a basic sync
      // TODO: Implement full getTouchEventQueries method with all 200+ fields

      // Get basic event data
      const eventDataResult = await connection.sql(`
        USE ${dbName};
        SELECT TOP 1
            e._guid AS eg,
            e.Event_id AS e,
            e.affiliate_id AS a,
            e.Event_begins AS eb,
            e.Event_ends AS ee,
            e.Event_title AS et,
            e.Event_description AS de,
            e.Event_contact AS en,
            e.Event_email AS em,
            e.Event_phone AS eph,
            e.venue_id AS vn,
            vu.venue_name AS vm,
            vu.venue_address AS va,
            vu.venue_city AS vc,
            vu.venue_region AS vr,
            vu.venue_lat AS vlt,
            vu.venue_long AS vlg,
            getDate() AS lu
        FROM b_Events AS e
            LEFT JOIN b_venues AS vu ON vu.venue_id = e.venue_id
        WHERE e.Event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      if (!eventDataResult.length) {
        return {
          status: 'fail',
          message: 'Event not found'
        };
      }

      let eventData = eventDataResult[0];

      // Get authority data
      const eatResult = await connection.sql(`
        USE ${dbName};
        SELECT ea.authority_id AS [at]
        FROM EventAuthority ea
        WHERE ea.Event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      eventData.eat = [eatResult.map(authority => authority.at)];

      // Get profile data
      const pfsResult = await connection.sql(`
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
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      eventData.pfs = pfsResult;

      // Get meal data
      const evmlResult = await connection.sql(`
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
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      eventData.evml = evmlResult;

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
      eventData.eqo = [];
      eventData.eq = [];
      eventData.ek = eventData.ek ? eventData.ek.split(',').map(item => item.replace(/\|\^\^\|/g, '')) : [];

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
      const updateIDs = await connection.sql(`
        USE ${dbName};
        SELECT eventFeeID
        FROM event_fees
        WHERE
            event_id = @eventID
            AND fee_disable <> 1
            AND autoInactive = 1
            AND isnull(activityEnd,'') <> '' 
            AND getDate() >= dateadd(d,1,activityEnd)
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute()
      .then(results => results.map(r => r.eventFeeID));

      // If there are none, return early
      if (!updateIDs.length) {
        return { message: 'success', updateCount: 0 };
      }

      // Disable fees in SQL
      await connection.sql(`
        USE ${dbName};
        UPDATE event_fees
        SET fee_disable = 1
        WHERE
            event_id = @eventID
            AND fee_disable <> 1
            AND autoInactive = 1
            AND isnull(activityEnd,'') <> '' 
            AND getDate() >= dateadd(d,1,activityEnd)
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        UPDATE b_events
        SET 
            regFormCount = 0,
            event_count = 0
        WHERE event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const result = await connection.sql(`
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
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute()
      .then(data => data[0] || {});

      // Convert boolean fields to numbers
      if (result) {
        result.ceuDisplayCounterOnReg = Number(result.ceuDisplayCounterOnReg || 0);
        result.ceuDisplayOnReg = Number(result.ceuDisplayOnReg || 0);
      }

      return result;
    } catch (error) {
      console.error('Error getting CEU config:', error);
      throw error;
    }
  }

  /**
   * Save event standard prompts
   */
  async saveEventStandardPrompts(request) {
    // TODO: Migrate implementation
    console.log('saveEventStandardPrompts called');
    return { success: true };
  }

  /**
   * Save event custom prompts
   */
  async saveEventCustomPrompts(request) {
    // TODO: Migrate implementation
    console.log('saveEventCustomPrompts called');
    return { success: true };
  }
}

export default new EventService();

