/**
 * VEO routes
 * Migrated from veo-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate, verticalCheck } from '../middleware/auth.js';
import VEOService from '../services/VEOService.js';
import eventService from '../services/EventService.js';

const veoService = new VEOService();

// Get share URL by event ID
export const getShareURLByEventIDRoute = {
  method: 'GET',
  path: '/veo/url/:eventID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.getShareURLByEventID(request);
    return createResponse(200, result);
  }
};

// Connector - Get options by slot ID
export const connectorGetOptionsRoute = {
  method: 'GET',
  path: '/veo/connector/getOptions/:slotID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.connectorGetOptions(request);
    return createResponse(200, result);
  }
};

// Connector - Save option
export const connectorSaveOptionRoute = {
  method: 'POST',
  path: '/veo/connector/saveOption',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.connectorSaveOption(request);
    return createResponse(200, result);
  }
};

// Get options by event GUID
export const getOptionsRoute = {
  method: 'GET',
  path: '/veo/getOptions/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.getOptions(request);
    return createResponse(200, result);
  }
};

// Save option
export const saveOptionRoute = {
  method: 'POST',
  path: '/veo/saveOption',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.saveOption(request);
    return createResponse(200, result);
  }
};

// Get slot ratings config
export const getSlotRatingsConfigRoute = {
  method: 'GET',
  path: '/veo/slotRatingsConfig/:slotID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.getRatingsConfigBySlotAndUser(request);
    return createResponse(200, result);
  }
};

// Check usage
export const checkUsageRoute = {
  method: 'GET',
  path: '/veo/usage/:slotID/:userID/:actionID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.checkUsage(request);
    return createResponse(200, result);
  }
};

// Set usage
export const setUsageRoute = {
  method: 'POST',
  path: '/veo/usage',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.setUsage(request);
    return createResponse(200, result);
  }
};

// Get attendee instructions
export const getAttendeeInstructionsRoute = {
  method: 'GET',
  path: '/veo/:eventGUID/attendeeInstructions',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await veoService.getOptions(request);
    return createResponse(200, {
      instructions: result.length && result[0].attendeeInstructions ? result[0].attendeeInstructions : ''
    });
  }
};

// Get config data
export const getConfigDataRoute = {
  method: 'GET',
  path: '/veo/config-data/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    // TODO: Implement userRegisteredForEvent middleware check
    
    const { eventGUID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    
    const eventData = await eventService.getEventDataByGUID(
      eventGUID,
      {
        et: 1,
        el3: 1,
        al3: 1,
        e: 1,
        en: 1,
        em: 1,
        eph: 1
      },
      vert
    );

    const contacts = [{
      name: eventData.en,
      email: eventData.em,
      phone: eventData.eph
    }, ...await eventService.getAdditionalContacts(eventGUID, vert)];

    let sponsorConfig = await eventService.getEventSponsorConfig(eventData.e, vert);
    const eventTZData = await eventService.getEventTimezoneData(eventData.e, vert);

    let veoActive = await veoService.checkVeoActive(eventGUID, vert);

    let veoConfig = await veoService.getOptions(request);

    let logoURL = eventData.el3;

    // if the logo is an empty string
    if (logoURL === "") {
      logoURL = eventData.al3;
    }

    return createResponse(200, {
      event: {
        zoneName: eventTZData.zoneName,
        eventID: eventData.e,
        name: eventData.et,
        logo: logoURL || '',
        sponsorLabel: sponsorConfig.length ? sponsorConfig[0].sponsorLabel : null
      },
      user: {
        fullname: `${request.session?.user_firstname || ''} ${request.session?.user_lastname || ''}`,
        avatar: request.session?.avatar
      },
      instructions: veoConfig.length && veoConfig[0].attendeeInstructions ? veoConfig[0].attendeeInstructions : '',
      contacts,
      veoActive,
      hasResources: veoConfig.length && veoConfig[0].hasAvailableResource > 0,
      hasSponsors: veoConfig.length && veoConfig[0].hasSponsors
    });
  }
};

// Scheduling Grid - Get slots
export const schedulingGridGetSlotsRoute = {
  method: 'GET',
  path: '/veo/schedulingGrid/getSlots/:scheduleID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.schedulingGridGetSlots(request);
    return createResponse(200, result);
  }
};

// Scheduling Grid - Export slots
export const schedulingGridExportSlotsRoute = {
  method: 'GET',
  path: '/veo/schedulingGrid/exportSlots/:scheduleID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.schedulingGridExportSlots(request);
    return createResponse(200, result);
  }
};

// Scheduling Grid - Get venues
export const schedulingGridGetVenuesRoute = {
  method: 'GET',
  path: '/veo/schedulingGrid/getVenues/:affiliateID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.schedulingGridGetVenues(request);
    return createResponse(200, result);
  }
};

// Scheduling Grid - Get rooms by affiliate
export const schedulingGridGetRoomsByAffiliateRoute = {
  method: 'GET',
  path: '/veo/schedulingGrid/getRoomsByAffiliate/:affiliateID',
  handler: async (request) => {
    await authenticate(request);
    const result = await veoService.schedulingGridGetRoomsByAffiliate(request);
    return createResponse(200, result);
  }
};

// Check if VEO is active
export const checkActiveRoute = {
  method: 'GET',
  path: '/veo/checkActive/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    const { eventGUID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await veoService.checkVeoActive(eventGUID, vert);
    return createResponse(200, result);
  }
};

// Get VEO resources
export const getVeoResourcesRoute = {
  method: 'GET',
  path: '/veo/resources/:eventID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const userId = Number(request.session?.user_id);
    const result = await veoService.getVeoResources(
      userId,
      Number(eventID),
      vert
    );
    return createResponse(200, result);
  }
};

