/**
 * Invitations routes migrated from Mantle invitations-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _invitationsService from '../services/InvitationsService.js';
import _eventsService from '../services/EventService.js';

/**
 * GET /invitations/:eventID/formData
 * Get invitation form data
 */
export const getInvitationFormDataRoute = {
  method: 'GET',
  path: '/invitations/:eventID/formData',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = request.pathParameters.eventID;
      const vert = request.vert;
      const affiliateID = request.session?.affiliate_id;
      const userID = request.session?.user_id;
      
      const profiles = await _invitationsService.getEventProfiles(eventID, vert);
      const lists = await _invitationsService.getEventsWithInviteesByAffiliate(eventID, affiliateID, vert);
      const imports = await _invitationsService.getImportableEvents(eventID, affiliateID, vert);
      const replyToList = await _invitationsService.getReplyToList(affiliateID, userID, vert);
      const counts = await _invitationsService.getInvitationCounts(eventID, vert);
      const event = await _eventsService.getEventData(request);
      
      // Match old codebase logic exactly: sets event.fromName but uses fromName variable (which stays as affiliate_name)
      // This means fromName will always be affiliate_name in the response, matching prod behavior
      let fromName = request.session?.affiliate_name || '';
      if (event.eef != '') {
        event.fromName = event.eef;
      } else if (event.ech != '') {
        event.fromName = event.ech;
      } else if (event.en != '') {
        event.fromName = event.en;
      }
      
      return createResponse(200, {
        profiles,
        lists,
        imports,
        replyToList,
        counts,
        event: {
          fromName,
          eventID: event.e,
          event_title: event.et,
          venue_id: event.vn,
          event_begins: event.eb,
          startTime: event.est,
          minorReg: event.emr
        }
      });
    } catch (error) {
      console.error('Error getting invitation form data:', error);
      return errorResponse('Failed to get invitation form data', 500, error.message);
    }
  }))
};

/**
 * GET /invitations/:eventID/inviteCounts
 * Get invitation counts
 */
export const getInvitationCountsRoute = {
  method: 'GET',
  path: '/invitations/:eventID/inviteCounts',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = request.pathParameters.eventID;
      const vert = request.vert;
      const counts = await _invitationsService.getInvitationCounts(eventID, vert);
      return createResponse(200, counts);
    } catch (error) {
      console.error('Error getting invitation counts:', error);
      return errorResponse('Failed to get invitation counts', 500, error.message);
    }
  }))
};

/**
 * POST /invitations/:eventID/auditInvitees
 * Audit invitees
 */
export const auditInviteesRoute = {
  method: 'POST',
  path: '/invitations/:eventID/auditInvitees',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = request.pathParameters.eventID;
      const vert = request.vert;
      const results = await _invitationsService.auditInvitees(eventID, vert);
      return createResponse(200, results);
    } catch (error) {
      console.error('Error auditing invitees:', error);
      return errorResponse('Failed to audit invitees', 500, error.message);
    }
  }))
};

/**
 * POST /invitations/:eventID/getInvitees
 * Get invitee list
 */
export const getInviteesRoute = {
  method: 'POST',
  path: '/invitations/:eventID/getInvitees',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = request.pathParameters.eventID;
      const vert = request.vert;
      const { keyword = '', profile = '', filter = '', skip = 0, amount = 20000000 } = request.body || {};
      
      const results = await _invitationsService.getInviteeList(
        eventID,
        keyword,
        profile,
        filter,
        skip,
        amount,
        vert
      );
      
      return createResponse(200, results);
    } catch (error) {
      console.error('Error getting invitees:', error);
      return errorResponse('Failed to get invitees', 500, error.message);
    }
  }))
};

/**
 * GET /invitations/getTemplates
 * Get invitation templates
 */
export const getTemplatesRoute = {
  method: 'GET',
  path: '/invitations/getTemplates',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const affiliateID = request.session?.affiliate_id;
      const vert = request.vert;
      const results = await _invitationsService.getTemplates(affiliateID, vert);
      return createResponse(200, results);
    } catch (error) {
      console.error('Error getting templates:', error);
      return errorResponse('Failed to get templates', 500, error.message);
    }
  }))
};

/**
 * DELETE /invitations/deleteTemplate/:recordID
 * Delete invitation template
 */
export const deleteTemplateRoute = {
  method: 'DELETE',
  path: '/invitations/deleteTemplate/:recordID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const recordID = request.pathParameters.recordID;
      const vert = request.vert;
      const result = await _invitationsService.deleteTemplate(recordID, vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error deleting template:', error);
      return errorResponse('Failed to delete template', 500, error.message);
    }
  }))
};

