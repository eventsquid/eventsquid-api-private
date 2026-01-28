/**
 * Agenda functions
 * Migrated from Mantle functions/agenda
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { getDatabase } from '../utils/mongodb.js';
import moment from 'moment-timezone';
import _ from 'lodash';

/**
 * Toggle sponsor binding to slot
 */
export async function toggleSponsorBinding(eventID, slotID, sponsorID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    request.input('slotID', sql.Int, Number(slotID));
    request.input('sponsorID', sql.Int, Number(sponsorID));
    await request.query(`
      USE ${dbName};
      IF NOT EXISTS (
          SELECT record_id
          FROM slotSponsor
          WHERE slot_id = @slotID
              AND sponsor_id = @sponsorID
              AND event_id = @eventID
      )
          BEGIN
              INSERT INTO slotSponsor (
                  event_id,
                  slot_id,
                  sponsor_id
              ) VALUES (
                  @eventID,
                  @slotID,
                  @sponsorID
              )
          END
      ELSE
          BEGIN
              DELETE FROM slotSponsor
              WHERE slot_id = @slotID
                  AND sponsor_id = @sponsorID
                  AND event_id = @eventID
          END
    `);

    return 'Agenda Slot Binding Updated';
  } catch (error) {
    console.error('Error toggling sponsor binding:', error);
    throw error;
  }
}

/**
 * Get agenda slots by event ID
 * Note: Uses stored procedure node_getAgendaSlots
 */
export async function getAgendaSlotsByEventID(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getAgendaSlots @eventID
    `);
    let slots = result.recordset;

    // Format the reviewsOff to a boolean
    slots = slots.map(slot => ({ ...slot, reviewsOff: slot.reviewsOff ? true : false }));

    // Grouping by slotID because there could be duplicates due to group-by on speaker data
    let slotGroups = _.groupBy(slots, 'slot_id');
    slotGroups = _.keys(slotGroups).map(key => slotGroups[key]);

    // Getting the speakers out of the group and combining it with the slot data
    return slotGroups.map(group => {
      const speakers = [];
      group.forEach(slot => {
        if (slot.speaker_id) {
          speakers.push({
            id: slot.speaker_id,
            name: slot.speaker_name,
            reviews: {
              off: slot.speakerReviewsOff ? true : false,
              bundles: slot.bundleIDList ? slot.bundleIDList.split(',').map(id => Number(id)) : [],
              eventFeeIDs: slot.eventFeeIDList ? slot.eventFeeIDList.split(',').map(id => Number(id)) : []
            }
          });
        }
      });

      // Get the first slot as base
      const baseSlot = group[0];
      
      // Extract eventFeeID - ensure it's a single value, not an array
      let eventFeeID = null;
      if (baseSlot.eventFeeID !== undefined) {
        // If it's an array, take the first value (shouldn't happen, but handle it)
        eventFeeID = Array.isArray(baseSlot.eventFeeID) ? baseSlot.eventFeeID[0] : baseSlot.eventFeeID;
      } else if (baseSlot.EventFeeID !== undefined) {
        eventFeeID = Array.isArray(baseSlot.EventFeeID) ? baseSlot.EventFeeID[0] : baseSlot.EventFeeID;
      }
      
      // Return the slot with the combined speaker data
      // Explicitly set eventFeeID to ensure it's a single value
      const combinedSlot = { 
        ...baseSlot, 
        speakers,
        eventFeeID: eventFeeID
      };
      
      // Clean out now un-needed keys and any duplicate eventFeeID variations
      delete combinedSlot['speaker_id'];
      delete combinedSlot['speaker_name'];
      delete combinedSlot['speakerReviewsOff'];
      delete combinedSlot['bundleIDList'];
      delete combinedSlot['eventFeeIDList'];
      delete combinedSlot['EventFeeID']; // Remove any uppercase variant

      return combinedSlot;
    });
  } catch (error) {
    console.error('Error getting agenda slots by event ID:', error);
    throw error;
  }
}

/**
 * Get slot data by ID
 * Uses stored procedure node_getAgendaSlot2
 */
export async function getSlotDataByID(slotID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('slotID', sql.Int, Number(slotID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getAgendaSlot2 @slotID
    `);
    const data = result.recordset;

    if (!data.length) return null;

    const slotData = data[0];
    if (!slotData.zoneName) slotData.zoneName = '';

    // START: All of this code will be avoided once the tz conversion to UTC happens on this data
    let slotStartDate = moment(slotData.date_slot, moment.ISO_8601);
    let slotStartTime = moment(slotData.time_slot, moment.ISO_8601);

    if (slotData.zoneName && slotData.zoneName.length) {
      slotStartDate = slotStartDate.tz(slotData.zoneName, true);
      slotStartTime = slotStartTime.tz(slotData.zoneName, true);
    } else {
      slotStartDate = slotStartDate.utc(true);
      slotStartTime = slotStartTime.utc(true);
    }

    // Generate end date/time by adding duration (in minutes) to the start datetime
    let slotStart = moment(`${slotStartDate.format('YYYY-MM-DD')}T${slotStartTime.format('HH:mm:ss.SSS')}Z`);

    if (slotData.zoneName && slotData.zoneName.length) {
      slotStart = slotStart.tz(slotData.zoneName, true);
    }

    slotStart = slotStart.utc();
    let slotEnd = slotStart.clone().add(slotData.slotDuration, 'minutes');

    let veoStart = slotStart.clone();
    let veoEnd = slotEnd.clone();
    // END

    if (slotData.veoGoLinkStart || slotData.veoGoLinkStart == 0) {
      veoStart = veoStart.subtract(slotData.veoGoLinkStart, 'minutes');
    } else {
      veoStart = veoStart.subtract(10, 'minutes');
    }

    if (slotData.veoGoLinkEnd) {
      veoEnd = veoEnd.add(slotData.veoGoLinkEnd, 'minutes');
    }

    return {
      id: slotData.slot_id,
      zoneName: slotData.zoneName || '',
      eventID: slotData.event_id,
      eventFeeID: slotData.eventFeeID,
      title: slotData.slottitle,
      description: slotData.slotDescription || '',
      startDate: slotStart.format(),
      endDate: slotEnd.format(),
      addToItineraryDisabled: slotData.disableAddToMyItinerary == 1,
      speakerLabel: slotData.speakerLabel || '',
      scheduleName: slotData.schedule_name,
      enableAutoCheckIn: slotData.enableAutoCheckIn,
      veo: {
        joinURL: slotData.veoMeetingLink,
        launchSessionLabel: slotData.sessionLaunchBtnLabel || '',
        launchSessionLabelColor: slotData.sessionLaunchBtnLabelColor || '',
        veoStart: veoStart.format(),
        veoEnd: veoEnd.format(),
        veoNoEnd: slotData.veoGoLinkEnd == -1 || slotData.slotDuration == 0
      },
      ceu: {
        acronym: slotData.ceuAcronym || '',
        valueLabel: slotData.ceuValueLabel || ''
      }
    };
  } catch (error) {
    console.error('Error getting slot data by ID:', error);
    throw error;
  }
}

/**
 * Get slot speakers
 */
export async function getSlotSpeakers(slotID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('slotID', sql.Int, Number(slotID));
    const result = await request.query(`
      USE ${dbName};
      SELECT 
        s.speaker_id,
        s.speaker_name,
        s.speaker_bio,
        s.speaker_PhotoS3,
        s.speaker_photo,
        u.user_company,
        u.user_position
      FROM b_speakers s
      LEFT JOIN b_users u on u.user_id = s.user_id
      WHERE s.speaker_id IN (
        SELECT speaker_id FROM speakerSchedule WHERE slot_id = @slotID
      )
    `);
    const results = result.recordset;

    return results.map(speaker => ({
      name: speaker.speaker_name,
      role: speaker.user_position,
      organization: speaker.user_company,
      bio: speaker.speaker_bio ? decodeURIComponent(speaker.speaker_bio) : null,
      img: speaker.speaker_photo,
      imgS3: speaker.speaker_PhotoS3
    }));
  } catch (error) {
    console.error('Error getting slot speakers:', error);
    throw error;
  }
}

/**
 * Get slot sponsors
 */
export async function getSlotSponsors(eventID, slotID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Import getEventSponsors dynamically to avoid circular dependency
    const { getEventSponsors } = await import('./sponsors.js');
    const eventSponsors = await getEventSponsors(eventID, vert);

    const request = new sql.Request();
    request.input('slotID', sql.Int, Number(slotID));
    const result = await request.query(`
      USE ${dbName};
      SELECT
        s.sponsorID,
        s.affiliate_name AS sponsorName,
        s.logo,
        s.logoS3,
        s.affiliate_website,
        (
          SELECT TOP 1 es.level_id 
          FROM event_sponsor es
          LEFT JOIN b_sponsorLevels sl ON sl.level_id = es.level_id
          WHERE es.event_id = st.event_id
            AND es.sponsorID = s.sponsorID
          ORDER BY 
            sl.level_order asc,
            sl.level_id DESC
        ) as level_id
      FROM event_resources_to_agenda_slots link 
        JOIN eventUploads r ON link.resource_id = r.upload_id 
        JOIN b_sponsors s ON r.sponsorID = s.sponsorID
        JOIN scheduleTimes st on st.slot_id = @slotID
      WHERE
        link.slot_id = @slotID AND r.deleted = 0
      GROUP BY
        s.sponsorID,
        s.affiliate_name,
        s.logo,
        s.logoS3,
        s.affiliate_website,
        st.event_id
      UNION
      SELECT
        s.sponsorID,
        s.affiliate_name AS sponsorName,
        s.logo,
        s.logoS3,
        s.affiliate_website,
        (
          SELECT TOP 1 es.level_id 
          FROM event_sponsor es
          LEFT JOIN b_sponsorLevels sl ON sl.level_id = es.level_id
          WHERE es.event_id = st.event_id
            AND es.sponsorID = s.sponsorID
          ORDER BY 
            sl.level_order asc,
            sl.level_id DESC
        ) as level_id
      FROM b_sponsors s
      JOIN scheduleTimes st on st.slot_id = @slotID
      WHERE
        s.sponsorID IN (
          SELECT sponsor_id FROM slotSponsor WHERE slot_id = @slotID
        )
    `);
    const results = result.recordset;

    return results.map(sponsor => {
      if (!sponsor.level_id) return sponsor;
      const eventLevelConfig = eventSponsors.find(eventSponsor => 
        eventSponsor.level_id === sponsor.level_id 
        && eventSponsor.sponsorID === sponsor.sponsorID
      );

      if (eventLevelConfig) {
        sponsor = Object.assign(sponsor, eventLevelConfig);
      }
      return sponsor;
    });
  } catch (error) {
    console.error('Error getting slot sponsors:', error);
    throw error;
  }
}

/**
 * Get slot track assignments by event ID
 */
export async function getSlotTrackAssignmentsByEventID(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      SELECT 
        st.slot_id,
        t.trackName,
        t.trackColor,
        t.trackID
      FROM scheduleTracks st 
      LEFT JOIN b_tracks t ON t.trackID = st.trackID
      WHERE event_id = @eventID
    `);
    const trackAssignments = result.recordset;

    const condensedAssignments = {};

    trackAssignments.forEach(assignment => {
      const trackAssignment = {
        id: assignment.trackID,
        name: assignment.trackName,
        color: `#${assignment.trackColor}`
      };
      if (condensedAssignments[assignment.slot_id]) {
        condensedAssignments[assignment.slot_id].push(trackAssignment);
      } else {
        condensedAssignments[assignment.slot_id] = [trackAssignment];
      }
    });

    return condensedAssignments;
  } catch (error) {
    console.error('Error getting slot track assignments by event ID:', error);
    throw error;
  }
}

/**
 * Get agenda speakers by event ID
 */
export async function getAgendaSpeakersByEventID(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      SELECT 
        ss.slot_id,
        s.speaker_id,
        s.speaker_name,
        s.speaker_bio,
        s.speaker_PhotoS3,
        s.speaker_photo,
        u.user_company,
        u.user_position
      FROM b_speakers s
      LEFT JOIN b_users u on u.user_id = s.user_id
      LEFT JOIN speakerSchedule ss on ss.speaker_id = s.speaker_id
      WHERE s.speaker_id IN (
        SELECT speaker_id FROM speakerSchedule WHERE slot_id IN (
          SELECT slot_id FROM scheduleTimes WHERE event_id = @eventID
        )
      )
    `);
    const results = result.recordset;

    return results.map(speaker => ({
      slotID: speaker.slot_id,
      name: speaker.speaker_name,
      role: speaker.user_position,
      organization: speaker.user_company,
      bio: speaker.speaker_bio ? decodeURIComponent(speaker.speaker_bio) : null,
      img: speaker.speaker_photo,
      imgS3: speaker.speaker_PhotoS3
    }));
  } catch (error) {
    console.error('Error getting agenda speakers by event ID:', error);
    throw error;
  }
}

/**
 * Get my itinerary slots by contestant ID
 */
export async function getMyItinerarySlotsByContestantID(contestantID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const sqlRequest1 = new sql.Request();
    sqlRequest1.input('contestantID', sql.Int, Number(contestantID));
    const result1 = await sqlRequest1.query(`
      USE ${dbName};
      SELECT i.slot_id
      FROM contestantMyItinerary i
      INNER JOIN eventContestant ec ON ec.contestant_id = i.contestant_id
      WHERE i.contestant_id = @contestantID
    `);
    const favorites = result1.recordset.map(slot => slot.slot_id);

    const checkinData = [];
    const sqlRequest2 = new sql.Request();
    sqlRequest2.input('contestantID', sql.Int, Number(contestantID));
    const result2 = await sqlRequest2.query(`
      USE ${dbName};
      SELECT 
        cf.eventFeeID,
        cf.checkedIn,
        cf.checkedOut
      FROM contestant_fees cf
      INNER JOIN eventContestant ec ON ec.contestant_id = cf.contestant_id
      WHERE cf.contestant_id = @contestantID
    `);
    const regSlots = result2.recordset.map(({ eventFeeID, checkedIn, checkedOut }) => {
      checkinData.push({ eventFeeID, checkedIn, checkedOut });
      return eventFeeID;
    });

    return {
      favorites,
      regSlots,
      checkinData
    };
  } catch (error) {
    console.error('Error getting my itinerary slots by contestant ID:', error);
    throw error;
  }
}

/**
 * Get speaker documents
 * Uses stored procedure node_getAgendaSlotDocumentsNew
 */
export async function getSpeakerDocuments({ slotID, userID, website = -1, mobile = -1, vert }) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('slotID', sql.Int, Number(slotID));
    request.input('userID', sql.Int, Number(userID));
    request.input('website', sql.Int, Number(website));
    request.input('mobile', sql.Int, Number(mobile));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getAgendaSlotDocumentsNew
        @slotID,
        @userID,
        @website,
        @mobile
    `);
    return result.recordset;
  } catch (error) {
    console.error('Error getting speaker documents:', error);
    throw error;
  }
}

