/**
 * Agenda routes migrated from Mantle agenda-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import AgendaService from '../services/AgendaService.js';

const _agendaService = new AgendaService();

/**
 * GET /agenda/agendaSlots/:eventID
 * Get agenda slots for event
 */
export const getAgendaSlotsRoute = {
  method: 'GET',
  path: '/agenda/agendaSlots/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _agendaService.getAgendaData(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting agenda data:', error);
      return errorResponse('Failed to get agenda data', 500, error.message);
    }
  }))
};

/**
 * POST /agenda/agendaSlots/sponsor
 * Add sponsor to slot
 */
export const addSponsorToSlotRoute = {
  method: 'POST',
  path: '/agenda/agendaSlots/sponsor',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { eventID, slotID, sponsorID } = request.body || {};
      
      if (!(eventID && slotID && sponsorID)) {
        return errorResponse('Data missing', 400);
      }
      
      const result = await _agendaService.addSponsorToSlot(eventID, slotID, sponsorID, request.vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error adding sponsor to slot:', error);
      return errorResponse('Failed to add sponsor to slot', 500, error.message);
    }
  }))
};

/**
 * PUT /agenda/agendaSlots/sponsor/toggle
 * Toggle sponsor slot binding
 */
export const toggleSponsorSlotBindingRoute = {
  method: 'PUT',
  path: '/agenda/agendaSlots/sponsor/toggle',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { eventID, slotID, sponsorID } = request.body || {};
      
      if (!(eventID && slotID && sponsorID)) {
        return errorResponse('Data missing', 400);
      }
      
      const result = await _agendaService.toggleSponsorSlotBinding(
        Number(eventID),
        Number(slotID),
        Number(sponsorID),
        request.vert
      );
      return successResponse(result);
    } catch (error) {
      console.error('Error toggling sponsor slot binding:', error);
      return errorResponse('Failed to toggle sponsor slot binding', 500, error.message);
    }
  }))
};

/**
 * DELETE /agenda/agendaSlots/sponsor
 * Remove sponsor from slot
 */
export const removeSponsorFromSlotRoute = {
  method: 'DELETE',
  path: '/agenda/agendaSlots/sponsor',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { eventID, slotID, sponsorID } = request.body || {};
      
      if (!(eventID && slotID && sponsorID)) {
        return errorResponse('Data missing', 400);
      }
      
      const result = await _agendaService.removeSponsorFromSlot(eventID, slotID, sponsorID, request.vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error removing sponsor from slot:', error);
      return errorResponse('Failed to remove sponsor from slot', 500, error.message);
    }
  }))
};

/**
 * GET /agenda/slots/:eventID/grouped
 * Get grouped agenda slots
 */
export const getGroupedAgendaSlotsRoute = {
  method: 'GET',
  path: '/agenda/slots/:eventID/grouped',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = request.pathParameters.eventID;
      const data = await _agendaService.getAgendaSlotData(eventID, request.vert);
      return successResponse(data);
    } catch (error) {
      console.error('Error getting grouped agenda slots:', error);
      return errorResponse('Failed to get grouped agenda slots', 500, error.message);
    }
  }))
};

/**
 * GET /agenda/slots/:eventGUID
 * Get VEO agenda data
 */
export const getVEOAgendaDataRoute = {
  method: 'GET',
  path: '/agenda/slots/:eventGUID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventGUID = request.pathParameters.eventGUID;
      const userID = request.session?.user_id;
      const data = await _agendaService.getVEOAgendaData(eventGUID, userID, request.vert);
      return successResponse(data);
    } catch (error) {
      console.error('Error getting VEO agenda data:', error);
      return errorResponse('Failed to get VEO agenda data', 500, error.message);
    }
  }))
};

/**
 * GET /agenda/:eventGUID/slot/:slotID
 * Get agenda slot
 */
export const getAgendaSlotRoute = {
  method: 'GET',
  path: '/agenda/:eventGUID/slot/:slotID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventGUID = request.pathParameters.eventGUID;
      const slotID = request.pathParameters.slotID;
      const userID = request.session?.user_id;
      const data = await _agendaService.getAgendaSlot(eventGUID, slotID, userID, request.vert);
      return successResponse(data);
    } catch (error) {
      console.error('Error getting agenda slot:', error);
      return errorResponse('Failed to get agenda slot', 500, error.message);
    }
  }))
};

/**
 * GET /agenda/mobile/:eventID/slot/:slotID/resources
 * Get mobile slot resources
 */
export const getMobileSlotResourcesRoute = {
  method: 'GET',
  path: '/agenda/mobile/:eventID/slot/:slotID/resources',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const slotID = Number(request.pathParameters.slotID);
      const userID = Number(request.session?.user_id);
      
      let data = await _agendaService.getAccessibleResources(
        { showOnMobile: true },
        userID,
        eventID,
        request.vert
      );
      
      // Filter resources for this slot and exclude video-embed
      data = data.filter(resource =>
        resource.slots.includes(slotID) &&
        resource.resource_type.indexOf('video-embed-') === -1
      );
      
      return successResponse(data);
    } catch (error) {
      console.error('Error getting mobile slot resources:', error);
      return errorResponse('Failed to get mobile slot resources', 500, error.message);
    }
  }))
};

