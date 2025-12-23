/**
 * Agenda Service
 * Migrated from Mantle AgendaService.js
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { toggleSponsorBinding, getAgendaSlotsByEventID } from '../functions/agenda.js';
import { getAccessibleResources } from '../functions/resources.js';
import _ from 'lodash';

class AgendaService {
  /**
   * Get agenda data
   * Complex method - needs full implementation with resources, speakers, sponsors, etc.
   */
  async getAgendaData(request) {
    // TODO: Full implementation - this is a very complex method (400+ lines in original)
    // Needs: resources, complex MSSQL query with joins, grouping, formatting
    console.log('getAgendaData called - complex implementation pending');
    return {
      schedules: [],
      days: [],
      tracks: [],
      agendaDetails: {}
    };
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

