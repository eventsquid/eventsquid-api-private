/**
 * Invitations Service
 * Migrated from Mantle InvitationsService.js
 */

import _eventService from './EventService.js';
import {
  getEventsWithInviteesByAffiliate,
  getInvitationCounts,
  auditInvitees,
  getInviteeList,
  getTemplates,
  deleteTemplate
} from '../functions/invitations.js';
import {
  getEventsWithRegistrants,
  getEventContactsByAffiliate
} from '../functions/events.js';
import _ from 'lodash';

class InvitationsService {
  /**
   * Get event profiles (filtered for invitation purposes)
   */
  async getEventProfiles(eventID, vert) {
    try {
      const profiles = await _eventService.getEventProfiles(eventID, vert);
      
      // Filter profiles that have bundle_cats and are not hidden from non-guests
      return profiles.filter(profile => {
        return (profile.bundle_cats && profile.bundle_cats.length)
          && (!profile.hidefromnonguests || profile.hidefromnonguests == 0);
      });
    } catch (error) {
      console.error('Error getting event profiles:', error);
      throw error;
    }
  }

  /**
   * Get events with invitees by affiliate
   */
  async getEventsWithInviteesByAffiliate(eventID, affiliateID, vert) {
    try {
      return await getEventsWithInviteesByAffiliate(eventID, affiliateID, vert);
    } catch (error) {
      console.error('Error getting events with invitees by affiliate:', error);
      throw error;
    }
  }

  /**
   * Get importable events (events with registrants, excluding current event)
   */
  async getImportableEvents(eventID, affiliateID, vert) {
    try {
      const events = await getEventsWithRegistrants(affiliateID, vert);
      return events.filter(event => 
        event.event_id != eventID && (!event.archive || event.archive == 0)
      );
    } catch (error) {
      console.error('Error getting importable events:', error);
      throw error;
    }
  }

  /**
   * Get reply to list (event contacts by affiliate)
   */
  async getReplyToList(affiliateID, userID, vert) {
    try {
      return await getEventContactsByAffiliate(affiliateID, userID, vert);
    } catch (error) {
      console.error('Error getting reply to list:', error);
      throw error;
    }
  }

  /**
   * Get invitation counts
   */
  async getInvitationCounts(eventID, vert) {
    try {
      return await getInvitationCounts(eventID, vert);
    } catch (error) {
      console.error('Error getting invitation counts:', error);
      throw error;
    }
  }

  /**
   * Audit invitees
   */
  async auditInvitees(eventID, vert) {
    try {
      return await auditInvitees(eventID, vert);
    } catch (error) {
      console.error('Error auditing invitees:', error);
      throw error;
    }
  }

  /**
   * Get invitee list
   */
  async getInviteeList(eventID, keyword, profile, generalFilter, skip, amount, vert) {
    try {
      const filter = {
        eventID,
        profile: profile || '',
        generalFilter: generalFilter || '',
        keyword: keyword || '',
        skip: skip || 0,
        amount: amount || 20000000
      };

      return await getInviteeList(filter, vert);
    } catch (error) {
      console.error('Error getting invitee list:', error);
      throw error;
    }
  }

  /**
   * Get templates
   */
  async getTemplates(affiliateID, vert) {
    try {
      return await getTemplates(affiliateID, vert);
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(recordID, vert) {
    try {
      return await deleteTemplate(recordID, vert);
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }
}

export default new InvitationsService();

