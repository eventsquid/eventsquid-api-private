/**
 * Agenda Service
 * Migrated from Mantle AgendaService.js
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { toggleSponsorBinding, getAgendaSlotsByEventID } from '../functions/agenda.js';
import { getAccessibleResources } from '../functions/resources.js';
import moment from 'moment-timezone';
import _ from 'lodash';

class AgendaService {
  /**
   * Get agenda data
   * Complex method with resources, speakers, sponsors, documents, tracks, etc.
   */
  async getAgendaData(request) {
    try {
      const eventID = Number(request.pathParameters?.eventID);
      const userID = Number(request.session?.user_id || 0);
      const vert = request.headers?.vert || request.vert || '';

      // Get accessible resources
      const resources = await getAccessibleResources(
        { showOnWebsite: true },
        userID,
        eventID,
        vert
      );

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Complex SQL query for agenda slots
      const slotQry = `
        USE ${dbName};
        SELECT
          e.event_title,
          ed.showOnWebsite,
          j.scheduleOrder,
          j.schedule_name,
          j.schedule_id,
          j.startDate,
          js.desktopShowAllText,
          js.slottitle,
          js.slotDuration,
          js.slotbreak,
          js.roomID,
          js.slotDescription,
          js.slot_id,
          js.time_slot,
          js.date_slot,
          s.speaker_id,
          s.speakerPhotoX,
          s.speakerPhotoY,
          s.speaker_photo,
          s.speaker_PhotoS3,
          s.speaker_thumb,
          s.speaker_thumbS3,
          s.constrainEdge,
          s.speaker_name,
          se.speakerTitle,
          CASE WHEN( ISNULL( ef.timeZone_id, 0 ) = 0 ) THEN e.tzabbr ELSE ef.tzabbrfee END AS tzabbrfee,
          ef.hideLocationRoomAgenda,
          r.roomName,
          r.roomCapacity,
          v.venue_name,
          uu.doc_id,
          uu.uploadTitle,
          uu.uploadType,
          uu.filenameS3,
          uu.thumbS3,
          uu.filename,
          uu.resource_type,
          ed.user_id,
          tr.trackName,
          tr.trackID,
          tr.trackColor,
          sp.sponsorID,
          sp.affiliate_name,
          sp.logo as sponsorLogo,
          sp.logoS3 as sponsorLogoS3,
          ss.record_id
        from schedules j
          LEFT JOIN b_events e on e.event_id = @eventID
          left join scheduleTimes js on js.schedule_id = j.schedule_id
          LEFT JOIN speakerSchedule ss on ss.slot_id = js.slot_id
          LEFT JOIN b_speakers s ON s.speaker_id = ss.speaker_id
          LEFT JOIN slotSponsor ssp on ssp.slot_id = js.slot_id
            AND ssp.event_id = @eventID
          LEFT JOIN b_sponsors sp on sp.sponsorID = ssp.sponsor_id
          LEFT JOIN speakerEvent se on se.speaker_id = s.speaker_id
            and se.event_id = j.event_id
            and isnull(se.active,0) = 1
          LEFT JOIN event_fees ef on ef.eventFeeID = js.eventFeeID
          LEFT JOIN b_rooms r on r.roomID = js.roomID
            and isnull(js.roomID,0) > 0
          LEFT JOIN b_venues v on js.venue_id = v.venue_id
          LEFT JOIN b_tracks tr ON tr.trackID in (
            SELECT trackID FROM scheduleTracks str WHERE str.event_id = @eventID AND str.slot_id = js.slot_id
          )
          LEFT join eventDocs ed on ed.speaker_id = ss.speaker_id
            and ed.event_id = @eventID
            and (
              ed.showonWebsite = 1
              or
              ed.showonMobile = -1
            )
            and (
              isnull(ed.displayAfterEventBegin,0) = 0
              OR
              ( isnull(ed.displayAfterEventBegin,0) = 1 and j.startDate >= getDate() )
            )
            and (
              (
                isnull(ed.showAttendeesOnly,0) = 0
                and isnull(ed.showCheckedinOnly,0) = 0
              )
              OR
              (
                isnull(ed.showAttendeesOnly,0) = 1
                and isnull(ed.showCheckedInOnly,0) = 0
                and EXISTS (
                  SELECT contestant_id from eventContestant
                  where user_id = @userID
                    and event_id = @eventID
                    and regcomplete = 1
                )
              )
              OR
              (
                isnull(ed.showCheckedInOnly,0) = 1
                and EXISTS (
                  SELECT contestant_id from eventContestant
                  where user_id = @userID
                    and event_id = @eventID
                    and regcomplete = 1
                    and checkedIn is not null
                )
              )
              OR
              ed.user_id = @userID
            )
          LEFT JOIN user_uploads uu on uu.doc_id = ed.doc_id
            AND uu.deleted = 0
            AND uu.resource_type = 'document-upload'
        WHERE
          j.event_id = @eventID
          AND js.date_slot >= j.startDate
          AND js.date_slot <= j.endDate
          AND (
            (
              js.slot_id in (
                select slot_id
                from scheduleTracks
                where event_id = @eventID
              )
            )
            or
            (
              js.slot_id in (
                select slot_id
                from scheduleTimes
                where event_id = @eventID
                  and slot_id not in (
                    select slot_id
                    from scheduleTracks
                    where event_id = @eventID
                  )
              )
            )
          )
        group by
          e.event_title,
          ss.record_id,
          j.schedule_id,
          js.date_slot,
          js.time_slot,
          js.slot_id,
          j.schedule_name,
          js.slottitle,
          js.desktopShowAllText,
          js.eventFeeID,
          j.startDate,
          js.slotDuration,
          js.slotBreak,
          js.slotDescription,
          js.roomID,
          js.venue_id,
          ef.classLimit,
          ef.fee_price,
          CASE WHEN( ISNULL( ef.timeZone_id, 0 ) = 0 ) THEN e.tzabbr ELSE ef.tzabbrfee END,
          se.speakerTitle,
          j.scheduleOrder,
          r.roomName,
          r.roomCapacity,
          v.venue_name,
          v.venue_region,
          v.venue_city,
          v.venue_address,
          s.speaker_photo,
          s.speakerPhotoX,
          s.speakerPhotoY,
          s.speaker_PhotoS3,
          s.speaker_thumb,
          s.speaker_thumbS3,
          s.speaker_id,
          s.speakerPhotoThumbS3,
          sp.affiliate_name,
          sp.sponsorID,
          sp.logo,
          sp.logoS3,
          s.speaker_name,
          ss.speaker_id,
          s.constrainEdge,
          js.location,
          uu.doc_id,
          uu.uploadTitle,
          uu.uploadType,
          uu.filenameS3,
          uu.thumbS3,
          uu.filename,
          uu.resource_type,
          ed.showAttendeesOnly,
          ed.showOnMobile,
          ed.showOnWebsite,
          ed.showCheckedInOnly,
          ed.user_id,
          ef.hideLocationRoomAgenda,
          tr.trackName,
          tr.trackID,
          tr.trackColor
        order by
          j.scheduleOrder,
          j.schedule_name,
          j.schedule_id,
          js.date_slot,
          js.time_slot,
          js.slotTitle,
          js.slotDuration,
          s.speaker_name,
          tr.trackName,
          sp.sponsorID
      `;

      const results = await connection.sql(slotQry)
        .parameter('eventID', TYPES.Int, eventID)
        .parameter('userID', TYPES.Int, userID)
        .execute();

      const slots = {};
      const schedules = {};
      const tracks = {};
      const days = {};

      // Process results
      results.forEach(slot => {
        const timeStart = new Date(slot.time_slot);
        const timeEnd = new Date(timeStart.getTime() + slot.slotDuration * 60000);
        const slotDate = moment(slot.date_slot);

        // Prepare the slot record
        const slotData = {
          scheduleID: slot.schedule_id,
          slotTitle: slot.slottitle,
          slotID: slot.slot_id,
          slotBreak: slot.slotbreak,
          slotDescription: slot.slotDescription,
          desktopShowAllText: slot.desktopShowAllText,
          slotTimeStart: timeStart,
          slotTimeEnd: timeEnd,
          slotDuration: slot.slotDuration,
          slotDate: slotDate,
          timeZoneAbbr: slot.tzabbrfee,
          showOnWebsite: slot.showOnWebsite,
          hideLocationRoomAgenda: slot.hideLocationRoomAgenda,
          venue: {
            venueName: slot.venue_name,
            roomName: slot.roomName,
            roomID: slot.roomID,
            roomCapacity: slot.roomCapacity
          },
          speakers: {},
          documents: {},
          tracks: {},
          sponsors: {}
        };

        // If this slot belongs to a schedule we haven't seen, store it
        if (!schedules.hasOwnProperty(slot.schedule_id)) {
          schedules[slot.schedule_id] = {
            startDate: slot.startDate,
            eventTitle: slot.event_title,
            scheduleName: slot.schedule_name,
            scheduleID: slot.schedule_id,
            scheduleOrder: slot.scheduleOrder,
            slots: []
          };
        }

        // Adds unique slot to the slot list
        if (!slots.hasOwnProperty(slot.slot_id)) {
          slots[slot.slot_id] = slotData;
        }

        // If this iteration has a speaker, add it
        if (slot.speaker_id && !slots[slot.slot_id].speakers.hasOwnProperty(slot.speaker_id)) {
          slots[slot.slot_id].speakers[slot.speaker_id] = {
            speakerRecordID: slot.record_id,
            speakerTitle: slot.speakerTitle,
            speakerName: slot.speaker_name,
            speakerPhotoS3: slot.speaker_PhotoS3,
            speakerID: slot.speaker_id,
            speakerPhoto: slot.speaker_photo,
            speakerThumb: slot.speaker_thumb,
            speakerThumbS3: slot.speaker_thumbS3,
            constrainEdge: slot.constrainEdge,
            speakerPhotoX: slot.speakerPhotoX,
            speakerPhotoY: slot.speakerPhotoY,
            slotID: slot.slot_id,
            scheduleID: slot.schedule_id,
            showMore: false
          };
        }

        // If this iteration has a sponsor, add it
        if (slot.sponsorID && !slots[slot.slot_id].sponsors.hasOwnProperty(slot.sponsorID)) {
          slots[slot.slot_id].sponsors[slot.sponsorID] = {
            sponsorID: slot.sponsorID,
            sponsorName: slot.affiliate_name,
            logo: slot.sponsorLogo,
            logoS3: slot.sponsorLogoS3
          };
        }

        // If this iteration has a document, add it
        if (slot.doc_id && !slots[slot.slot_id].documents.hasOwnProperty(slot.doc_id)) {
          slots[slot.slot_id].documents[slot.doc_id] = {
            uploadType: slot.uploadType,
            uploadURL: slot.filename,
            uploadURLS3: slot.filenameS3,
            userID: slot.user_id,
            uploadIconURL: `/images/icons/icon-${slot.uploadType}.png`,
            uploadTitle: slot.uploadTitle,
            resourceType: slot.resource_type
          };
        }

        // If this iteration has a track, add it
        if (slot.trackID && !slots[slot.slot_id].tracks.hasOwnProperty(slot.trackID)) {
          slots[slot.slot_id].tracks[slot.trackID] = {
            trackID: slot.trackID,
            trackName: slot.trackName,
            trackColor: `#${slot.trackColor}`
          };
        }

        // Adds to cross-schedule list of tracks
        if (slot.trackID && !tracks.hasOwnProperty(slot.trackID)) {
          tracks[slot.trackID] = {
            trackID: slot.trackID,
            trackName: slot.trackName,
            trackColor: `#${slot.trackColor}`
          };
        }

        // Adds to cross-schedule list of days
        const dayKey = `${slotDate.month()}-${slotDate.date()}-${slotDate.year()}`;
        if (!days.hasOwnProperty(dayKey)) {
          days[dayKey] = slotDate;
        }
      });

      // Format the slots - converts from object to array
      const formattedSlots = _.keys(slots).map(slotID => {
        const slot = slots[slotID];
        slot.speakers = _.keys(slot.speakers).map(speakerID => slot.speakers[speakerID]);
        slot.documents = _.keys(slot.documents).map(documentID => slot.documents[documentID]);
        slot.tracks = _.keys(slot.tracks).map(trackID => slot.tracks[trackID]);
        slot.sponsors = _.keys(slot.sponsors).map(sponsorID => slot.sponsors[sponsorID]);
        slot.resources = resources.filter(resource =>
          resource.slots && resource.slots.includes(Number(slotID)) &&
          resource.resource_type && resource.resource_type.indexOf('video-embed-') === -1
        );
        return slot;
      });

      // Format the schedules - converts from object to array
      const formattedSchedules = _.keys(schedules).map(scheduleID => {
        const schedule = schedules[scheduleID];
        schedule.slots = formattedSlots.filter(slot => slot.scheduleID === scheduleID);
        // Sort slots by date/time, duration, then title
        schedule.slots = _.orderBy(schedule.slots, ['slotTimeStart', 'slotDuration', 'slotTitle']);
        return schedule;
      });

      const orderedSchedules = _.orderBy(formattedSchedules, ['scheduleOrder']);

      // Format the cross-schedule lists of tracks and days
      const formattedTracks = _.sortBy(_.keys(tracks).map(trackID => tracks[trackID]), 'trackName');
      const formattedDays = _.keys(days).map(date => days[date]);

      // Get agenda details
      const detailsQry = `
        USE ${dbName};
        SELECT
          e.agenda_link,
          e.hideGridButton,
          e.agenda_link_button_color,
          e.agenda_link_button_label,
          e.agenda_link_button_text_color,
          v.venue_name,
          e.affiliate_id,
          e.event_title,
          ISNULL(e.sponsorFirstAgenda, 1) as sponsorFirstAgenda,
          b.buttonCustomName as sponsorLabel
        FROM b_events e
        inner join b_venues v on v.venue_id = e.venue_id
        inner join b_buttons b on b.eventID = e.event_id
          AND b.buttonDefaultName = 'Sponsors'
        WHERE event_id = @eventID
      `;

      const agendaDetailsResult = await connection.sql(detailsQry)
        .parameter('eventID', TYPES.Int, eventID)
        .execute();

      let agendaDetails = agendaDetailsResult[0] || {};

      if (agendaDetails.agenda_link && !agendaDetails.agenda_link.includes('http')) {
        agendaDetails.agenda_link = `https://${agendaDetails.agenda_link}`;
      }

      return {
        schedules: orderedSchedules,
        days: formattedDays,
        tracks: formattedTracks,
        agendaDetails
      };
    } catch (error) {
      console.error('Error getting agenda data:', error);
      throw error;
    }
  }

  /**
   * Add sponsor to slot
   */
  async addSponsorToSlot(eventID, slotID, sponsorID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        IF NOT EXISTS (
            SELECT record_id
            FROM slotSponsor
            WHERE event_id = @eventID
                and slot_id = @slotID
                and sponsor_id = @sponsorID
        )
        BEGIN
            insert into slotSponsor (
                event_id,
                slot_id,
                sponsor_id
            ) values (
                @eventID,
                @slotID,
                @sponsorID
            )
        END
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('slotID', TYPES.Int, Number(slotID))
      .parameter('sponsorID', TYPES.Int, Number(sponsorID))
      .execute();

      return { message: 'success' };
    } catch (error) {
      console.error('Error adding sponsor to slot:', error);
      throw error;
    }
  }

  /**
   * Toggle sponsor slot binding
   */
  async toggleSponsorSlotBinding(eventID, slotID, sponsorID, vert) {
    try {
      const result = await toggleSponsorBinding(eventID, slotID, sponsorID, vert);
      return { message: result };
    } catch (error) {
      console.error('Error toggling sponsor slot binding:', error);
      throw error;
    }
  }

  /**
   * Remove sponsor from slot
   */
  async removeSponsorFromSlot(eventID, slotID, sponsorID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        DELETE FROM slotSponsor
        WHERE event_id = @eventID
            AND slot_id = @slotID
            AND sponsor_id = @sponsorID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('slotID', TYPES.Int, Number(slotID))
      .parameter('sponsorID', TYPES.Int, Number(sponsorID))
      .execute();

      return { message: 'success' };
    } catch (error) {
      console.error('Error removing sponsor from slot:', error);
      throw error;
    }
  }

  /**
   * Get agenda slot data (grouped by schedule)
   */
  async getAgendaSlotData(eventID, vert) {
    try {
      const slots = await getAgendaSlotsByEventID(eventID, vert);
      return _.groupBy(slots, 'schedule_name');
    } catch (error) {
      console.error('Error getting agenda slot data:', error);
      throw error;
    }
  }

  /**
   * Get VEO agenda data
   * Complex method - needs full implementation with event GUID lookup, attendee data, etc.
   */
  async getVEOAgendaData(eventGUID, userID, vert) {
    // TODO: Full implementation - needs:
    // - getEventDataByGUID
    // - getRegisteredAttendeeByUserID
    // - getAgendaSlotsByEventID
    // - getSlotTrackAssignmentsByEventID
    // - getMyItinerarySlotsByContestantID
    // - getAllRatingConfigsByEventAndUser
    // - getAgendaSpeakersByEventID
    // - checkUsageByEventAndAction
    console.log('getVEOAgendaData called - complex implementation pending');
    return {
      agendas: [],
      tracks: [],
      slots: []
    };
  }

  /**
   * Get agenda slot
   * Complex method - needs full implementation with slot data, speakers, sponsors, etc.
   */
  async getAgendaSlot(eventGUID, slotID, userID, vert) {
    // TODO: Full implementation - needs:
    // - getEventDataByGUID
    // - getSlotDataByID
    // - getRegItemByEventFeeID
    // - getRegisteredAttendeeByUserID
    // - getSlotSpeakers
    // - getSlotSponsors
    // - getSpeakerDocuments
    console.log('getAgendaSlot called - complex implementation pending');
    return {};
  }

  /**
   * Get accessible resources
   */
  async getAccessibleResources(filters, userID, eventID, vert) {
    try {
      return await getAccessibleResources(filters, userID, eventID, vert);
    } catch (error) {
      console.error('Error getting accessible resources:', error);
      throw error;
    }
  }
}

export default new AgendaService();

