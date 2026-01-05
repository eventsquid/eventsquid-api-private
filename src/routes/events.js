/**
 * Event routes migrated from Mantle events-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import EventService from '../services/EventService.js';

const _eventsService = new EventService();

/**
 * POST /event
 * Get Events specifying filters
 */
export const findEventsRoute = {
  method: 'POST',
  path: '/event',
  handler: requireAuth(async (request) => {
    try {
      const result = await _eventsService.findEvents(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error finding events:', error);
      return errorResponse('Failed to find events', 500, error.message);
    }
  })
};

/**
 * POST /event/:eventID/customPrompts
 * Save Custom Prompt Changes
 */
export const updateCustomPromptsRoute = {
  method: 'POST',
  path: '/event/:eventID/customPrompts',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const result = await _eventsService.updateCustomPrompts(eventID, vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating custom prompts:', error);
      return errorResponse('Failed to update custom prompts', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/allData
 * Get all event data
 */
export const getEventDataRoute = {
  method: 'GET',
  path: '/event/:eventID/allData',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      // Make sure fees are all squared away before grabbing data
      await _eventsService.autoDeactivateFees(request);
      await _eventsService.updateRegItems(request);
      
      const result = await _eventsService.getEventData(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event data:', error);
      return errorResponse('Failed to get event data', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/profiles
 * Get event profiles
 */
export const getEventProfilesRoute = {
  method: 'GET',
  path: '/event/:eventID/profiles',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const profiles = await _eventsService.getEventProfiles(eventID, vert);
      return successResponse(profiles);
    } catch (error) {
      console.error('Error getting event profiles:', error);
      return errorResponse('Failed to get event profiles', 500, error.message);
    }
  }))
};

/**
 * PUT /event/:eventID
 * Update event
 */
export const updateEventRoute = {
  method: 'PUT',
  path: '/event/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const result = await _eventsService.updateEvent(eventID, request.body, vert);
      
      await _eventsService.touchEvent(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating event:', error);
      return errorResponse('Failed to update event', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/duration
 * Get event duration
 */
export const getEventDurationRoute = {
  method: 'GET',
  path: '/event/:eventID/duration',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = request.pathParameters.eventID;
      const vert = request.vert;
      const result = await _eventsService.getEventDuration(eventID, vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event duration:', error);
      return errorResponse('Failed to get event duration', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventGUID/updateTimezoneData
 * Update event timezone data
 */
export const updateEventTimezoneDataRoute = {
  method: 'POST',
  path: '/event/:eventGUID/updateTimezoneData',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventGUID = request.pathParameters.eventGUID;
      const vert = request.vert;
      const data = await _eventsService.updateEventTimezoneData(eventGUID, vert);
      return successResponse(data);
    } catch (error) {
      console.error('Error updating event timezone data:', error);
      return errorResponse('Failed to update timezone data', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventGUID/item/:eventFeeID/updateTimezoneData
 * Update fee timezone data
 */
export const updateFeeTimezoneDataRoute = {
  method: 'POST',
  path: '/event/:eventGUID/item/:eventFeeID/updateTimezoneData',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventGUID = request.pathParameters.eventGUID;
      const eventFeeID = Number(request.pathParameters.eventFeeID);
      const vert = request.vert;
      const data = await _eventsService.updateFeeTimezoneData(eventGUID, eventFeeID, vert);
      return successResponse(data);
    } catch (error) {
      console.error('Error updating fee timezone data:', error);
      return errorResponse('Failed to update fee timezone data', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/speakers
 * Save the Speakers for this Event
 */
export const updateEventSpeakersRoute = {
  method: 'POST',
  path: '/event/:eventID/speakers',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.updateEventSpeakers(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating event speakers:', error);
      return errorResponse('Failed to update speakers', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/items
 * Save Reg Item Changes
 */
export const updateRegItemsRoute = {
  method: 'POST',
  path: '/event/:eventID/items',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.updateRegItems(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating reg items:', error);
      return errorResponse('Failed to update reg items', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/stamp
 * Update a timestamp
 */
export const updateTimestampRoute = {
  method: 'POST',
  path: '/event/:eventID/stamp',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.updateTimestamp(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating timestamp:', error);
      return errorResponse('Failed to update timestamp', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventGUID/ics/:vert
 * Generate event ICS file
 */
export const generateEventICSRoute = {
  method: 'GET',
  path: '/event/:eventGUID/ics/:vert',
  handler: async (request) => {
    try {
      const eventGUID = request.pathParameters.eventGUID;
      const vert = request.pathParameters.vert;
      const fileData = await _eventsService.generateEventICS(eventGUID, vert);
      
      if (fileData.success) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/calendar',
            'Content-Disposition': `attachment; filename="${eventGUID}.ics"`,
            'Access-Control-Allow-Origin': '*'
          },
          body: fileData.data
        };
      }
      
      return errorResponse('Failed to generate ICS', 500);
    } catch (error) {
      console.error('Error generating event ICS:', error);
      return errorResponse('Failed to generate ICS', 500, error.message);
    }
  }
};

/**
 * GET /event/:eventGUID/item/:eventFeeID/ics/:vert
 * Generate event fee ICS file
 */
export const generateEventFeeICSRoute = {
  method: 'GET',
  path: '/event/:eventGUID/item/:eventFeeID/ics/:vert',
  handler: async (request) => {
    try {
      const eventGUID = request.pathParameters.eventGUID;
      const eventFeeID = request.pathParameters.eventFeeID;
      const vert = request.pathParameters.vert;
      const fileData = await _eventsService.generateEventFeeICS(eventGUID, eventFeeID, vert);
      
      if (fileData.success) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/calendar',
            'Content-Disposition': `attachment; filename="${eventFeeID}.ics"`,
            'Access-Control-Allow-Origin': '*'
          },
          body: fileData.data
        };
      }
      
      return errorResponse('Failed to generate ICS', 500);
    } catch (error) {
      console.error('Error generating fee ICS:', error);
      return errorResponse('Failed to generate ICS', 500, error.message);
    }
  }
};

/**
 * POST /event/:eventID/touchEvent
 * Touch event (update last modified)
 */
export const touchEventRoute = {
  method: 'POST',
  path: '/event/:eventID/touchEvent',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.touchEvent(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error touching event:', error);
      return errorResponse('Failed to touch event', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/autoDeactivateFees
 * Auto deactivate fees
 */
export const autoDeactivateFeesRoute = {
  method: 'POST',
  path: '/event/:eventID/autoDeactivateFees',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.autoDeactivateFees(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error auto deactivating fees:', error);
      return errorResponse('Failed to auto deactivate fees', 500, error.message);
    }
  }))
};

/**
 * PUT /event/:eventID/resetViewCounts
 * Reset view counts
 */
export const resetViewCountsRoute = {
  method: 'PUT',
  path: '/event/:eventID/resetViewCounts',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = request.pathParameters.eventID;
      const vert = request.vert;
      const result = await _eventsService.resetViewCounts(eventID, vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error resetting view counts:', error);
      return errorResponse('Failed to reset view counts', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/ceu/config
 * Get CEU config
 */
export const getCEUConfigRoute = {
  method: 'GET',
  path: '/event/:eventID/ceu/config',
  handler: requireAuth(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.headers?.vert;
      const config = await _eventsService.getCEUConfig(eventID, vert);
      return successResponse(config);
    } catch (error) {
      console.error('Error getting CEU config:', error);
      return errorResponse('Failed to get CEU config', 500, error.message);
    }
  })
};

/**
 * GET /event/:eventID/uploads
 * Get event resources (documents)
 */
export const getEventUploadsRoute = {
  method: 'GET',
  path: '/event/:eventID/uploads',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const { getEventResources } = await import('../functions/resources.js');
      const resourceTypes = { documents: ['document-upload'] };
      const result = await getEventResources(eventID, resourceTypes.documents, vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event uploads:', error);
      return errorResponse('Failed to get event uploads', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/library
 * Get affiliate library resources (documents)
 */
export const getEventLibraryRoute = {
  method: 'GET',
  path: '/event/:eventID/library',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const event = await _eventsService.getEventData(request);
      const { getAffiliateResources } = await import('../functions/resources.js');
      const resourceTypes = { documents: ['document-upload'] };
      const result = await getAffiliateResources(event.a, resourceTypes.documents, vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event library:', error);
      return errorResponse('Failed to get event library', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/resource/library/video
 * Get affiliate library resources (videos)
 */
export const getEventLibraryVideoRoute = {
  method: 'GET',
  path: '/event/:eventID/resource/library/video',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const event = await _eventsService.getEventData(request);
      const { getAffiliateResources } = await import('../functions/resources.js');
      const resourceTypes = { videos: ['video'] };
      const result = await getAffiliateResources(event.a, resourceTypes.videos, vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event library videos:', error);
      return errorResponse('Failed to get event library videos', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/resource/video
 * Get event resources (videos)
 */
export const getEventVideoRoute = {
  method: 'GET',
  path: '/event/:eventID/resource/video',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const { getEventResources } = await import('../functions/resources.js');
      const resourceTypes = { videos: ['video'] };
      const result = await getEventResources(eventID, resourceTypes.videos, vert);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event videos:', error);
      return errorResponse('Failed to get event videos', 500, error.message);
    }
  }))
};

