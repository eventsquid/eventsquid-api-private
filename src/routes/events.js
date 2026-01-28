/**
 * Event routes migrated from Mantle events-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, errorResponseWithSNS, createResponse } from '../utils/response.js';
import _eventsService from '../services/EventService.js';

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
      // Return the data directly without wrapper
      return createResponse(200, result);
    } catch (error) {
      console.error('Error finding events:', error);
      return errorResponse('Failed to find events', 500, error.message, {
        requestId: request.event?.requestContext?.requestId || 'unknown',
        path: request.path,
        method: request.method,
        error: error
      });
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
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating custom prompts:', error);
      return errorResponse('Failed to update custom prompts', 500, error.message, {
        requestId: request.event?.requestContext?.requestId || 'unknown',
        path: request.path,
        method: request.method,
        error: error
      });
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
      const isLocalDev = process.env.NODE_ENV === 'development';
      
      // Make sure fees are all squared away before grabbing data
      // Skip in local dev if MongoDB is unavailable
      try {
        await _eventsService.autoDeactivateFees(request);
      } catch (error) {
        if (isLocalDev && error.message && error.message.includes('MongoServerSelectionError')) {
          console.warn('⚠️  Skipping autoDeactivateFees in local dev (MongoDB unavailable)');
        } else {
          throw error;
        }
      }
      
      try {
        await _eventsService.updateRegItems(request);
      } catch (error) {
        if (isLocalDev && error.message && error.message.includes('MongoServerSelectionError')) {
          console.warn('⚠️  Skipping updateRegItems in local dev (MongoDB unavailable)');
        } else {
          throw error;
        }
      }
      
      const result = await _eventsService.getEventData(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting event data:', error);
      
      // Provide helpful error message for local dev
      if (process.env.NODE_ENV === 'development' && error.message && error.message.includes('MongoServerSelectionError')) {
        return errorResponse(
          'MongoDB connection failed. For local development, set MONGO_CONNECTION_STRING in .env with a public MongoDB connection string (not a private endpoint).',
          503,
          error.message
        );
      }
      
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
      
      // In local dev, if results are empty, it's likely because MSSQL is unavailable
      if (process.env.NODE_ENV === 'development' && (!profiles || profiles.length === 0)) {
        // Return empty array but log a helpful message (only once per request)
        console.warn(`⚠️  getEventProfiles returned empty results for event ${eventID}`);
        console.warn('   This endpoint requires MSSQL access. In local dev, MSSQL is unavailable.');
        console.warn('   To get real data, set MSSQL_CONNECTION_STRING or MSSQL_HOST/USERNAME/PASSWORD in .env');
      }
      
      return createResponse(200, profiles);
    } catch (error) {
      console.error('Error getting event profiles:', error);
      
      // In local dev, provide helpful error message
      if (process.env.NODE_ENV === 'development') {
        return errorResponse(
          'This endpoint requires MSSQL access. In local dev, MSSQL is unavailable. Set MSSQL_CONNECTION_STRING or MSSQL_HOST/USERNAME/PASSWORD in .env to enable MSSQL.',
          503,
          error.message
        );
      }
      
      return errorResponse('Failed to get event profiles', 500, error.message, {
        requestId: request.event?.requestContext?.requestId || 'unknown',
        path: request.path,
        method: request.method,
        error: error
      });
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
      return createResponse(200, result);
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
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting event duration:', error);
      return errorResponseWithSNS('Failed to get event duration', 500, error, request);
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
      return createResponse(200, data);
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
      return createResponse(200, data);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
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
      return createResponse(200, config);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
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
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting event videos:', error);
      return errorResponse('Failed to get event videos', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/registrationNotifications
 * Get recipient notifications
 */
export const getRecipientNotificationsRoute = {
  method: 'GET',
  path: '/event/:eventID/registrationNotifications',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.getRecipientNotifications(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting recipient notifications:', error);
      return errorResponse('Failed to get recipient notifications', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/registrationNotifications/config
 * Get event details for notification setup
 */
export const getEventDetailsForNotificationSetupRoute = {
  method: 'GET',
  path: '/event/:eventID/registrationNotifications/config',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.getEventDetailsForNotificationSetup(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting event details for notification setup:', error);
      return errorResponse('Failed to get event details for notification setup', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/registrationNotifications
 * Add recipient notification
 */
export const addRecipientNotificationRoute = {
  method: 'POST',
  path: '/event/:eventID/registrationNotifications',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.addRecipientNotification(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error adding recipient notification:', error);
      return errorResponse('Failed to add recipient notification', 500, error.message);
    }
  }))
};

/**
 * PUT /event/:eventID/registrationNotifications
 * Update recipient notification
 */
export const updateRecipientNotificationRoute = {
  method: 'PUT',
  path: '/event/:eventID/registrationNotifications',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.updateRecipientNotification(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating recipient notification:', error);
      return errorResponse('Failed to update recipient notification', 500, error.message);
    }
  }))
};

/**
 * DELETE /event/:eventID/registrationNotifications/:notificationID
 * Delete recipient notification
 */
export const deleteRecipientNotificationRoute = {
  method: 'DELETE',
  path: '/event/:eventID/registrationNotifications/:notificationID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _eventsService.deleteRecipientNotification(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error deleting recipient notification:', error);
      return errorResponse('Failed to delete recipient notification', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/sponsorConfig
 * Get event sponsor config
 */
export const getEventSponsorConfigRoute = {
  method: 'GET',
  path: '/event/:eventID/sponsorConfig',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const result = await _eventsService.getEventSponsorConfig(eventID, vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting event sponsor config:', error);
      return errorResponse('Failed to get event sponsor config', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/sponsorConfig
 * Set event sponsor config
 */
export const setEventSponsorConfigRoute = {
  method: 'POST',
  path: '/event/:eventID/sponsorConfig',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const result = await _eventsService.setEventSponsorConfig(request.body, eventID, vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error setting event sponsor config:', error);
      return errorResponse('Failed to set event sponsor config', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/resources/grouped
 * Get grouped event resources
 */
export const getEventResourcesGroupedRoute = {
  method: 'GET',
  path: '/event/:eventID/resources/grouped',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const result = await _eventsService.getGroupedResources(eventID, vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting grouped resources:', error);
      return errorResponse('Failed to get grouped resources', 500, error.message);
    }
  }))
};

/**
 * GET /event/:eventID/resources/getSponsors
 * Get resource sponsors
 */
export const getEventResourceSponsorsRoute = {
  method: 'GET',
  path: '/event/:eventID/resources/getSponsors',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const affiliate_id = Number(request.session?.affiliate_id);
      const vert = request.vert;
      const result = await _eventsService.getResourceSponsors(affiliate_id, vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting resource sponsors:', error);
      return errorResponse('Failed to get resource sponsors', 500, error.message);
    }
  }))
};

/**
 * DELETE /event/:eventID/resource/:resourceID
 * Delete event resource
 */
export const deleteEventResourceRoute = {
  method: 'DELETE',
  path: '/event/:eventID/resource/:resourceID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const resourceID = Number(request.pathParameters.resourceID);
      const vert = request.vert;
      const result = await _eventsService.deleteEventResource(eventID, resourceID, vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error deleting event resource:', error);
      return errorResponse('Failed to delete event resource', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/resource/:resourceID
 * Update event resource
 */
export const updateEventResourceRoute = {
  method: 'POST',
  path: '/event/:eventID/resource/:resourceID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const resourceID = Number(request.pathParameters.resourceID);
      const vert = request.vert;
      const body = request.body || {};
      const result = await _eventsService.updateEventResource(
        eventID,
        resourceID,
        body.field,
        body.value,
        vert
      );
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating event resource:', error);
      return errorResponse('Failed to update event resource', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/upload
 * Add document to event
 */
export const addEventDocumentRoute = {
  method: 'POST',
  path: '/event/:eventID/upload',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const affiliateID = Number(request.session?.affiliate_id);
      const vert = request.vert;
      const result = await _eventsService.addDocumentToEvent(
        eventID,
        request.body,
        affiliateID,
        vert
      );
      return createResponse(200, result);
    } catch (error) {
      console.error('Error adding document to event:', error);
      return errorResponse('Failed to add document to event', 500, error.message);
    }
  }))
};

/**
 * POST /event/:eventID/resources/categories/add
 * Create event resource category
 */
export const createEventResourceCategoryRoute = {
  method: 'POST',
  path: '/event/:eventID/resources/categories/add',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const affiliate_id = request.body?.affiliate_id || null;
      const name = request.body?.name;
      const vert = request.vert;
      const result = await _eventsService.createResourceCategory(
        affiliate_id,
        eventID,
        name,
        vert
      );
      return createResponse(200, result);
    } catch (error) {
      console.error('Error creating event resource category:', error);
      return errorResponse('Failed to create event resource category', 500, error.message);
    }
  }))
};

/**
 * DELETE /event/:eventID/resources/categories/delete/:category_id/:sortOrder
 * Delete event resource category
 */
export const deleteEventResourceCategoryRoute = {
  method: 'DELETE',
  path: '/event/:eventID/resources/categories/delete/:category_id/:sortOrder',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const category_id = Number(request.pathParameters.category_id);
      const sortOrder = Number(request.pathParameters.sortOrder);
      const vert = request.vert;
      const result = await _eventsService.deleteEventResourceCategory(
        eventID,
        category_id,
        sortOrder,
        vert
      );
      return createResponse(200, result);
    } catch (error) {
      console.error('Error deleting event resource category:', error);
      return errorResponse('Failed to delete event resource category', 500, error.message);
    }
  }))
};