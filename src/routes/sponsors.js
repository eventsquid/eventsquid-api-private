/**
 * Sponsors routes migrated from Mantle sponsors-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import SponsorsService from '../services/SponsorsService.js';

const _sponsorService = new SponsorsService();

/**
 * POST /sponsors
 * Create affiliate sponsor
 */
export const createSponsorRoute = {
  method: 'POST',
  path: '/sponsors',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const affiliateID = Number(request.session?.affiliate_id);
      const response = await _sponsorService.createSponsor(affiliateID, request.body, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error creating sponsor:', error);
      return errorResponse('Failed to create sponsor', 500, error.message);
    }
  }))
};

/**
 * PUT /sponsors/:sponsorID
 * Update sponsor field
 */
export const updateSponsorRoute = {
  method: 'PUT',
  path: '/sponsors/:sponsorID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const sponsorID = Number(request.pathParameters.sponsorID);
      const { field, data } = request.body || {};
      const response = await _sponsorService.updateSponsorField(sponsorID, field, data, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error updating sponsor:', error);
      return errorResponse('Failed to update sponsor', 500, error.message);
    }
  }))
};

/**
 * GET /sponsors/affiliate/:affiliateID
 * Get affiliate sponsors
 */
export const getAffiliateSponsorsRoute = {
  method: 'GET',
  path: '/sponsors/affiliate/:affiliateID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const affiliateID = Number(request.pathParameters.affiliateID);
      const sponsors = await _sponsorService.getAffiliateSponsors(affiliateID, request.vert);
      return successResponse(sponsors);
    } catch (error) {
      console.error('Error getting affiliate sponsors:', error);
      return errorResponse('Failed to get affiliate sponsors', 500, error.message);
    }
  }))
};

/**
 * POST /sponsors/logo
 * Get sponsor logo
 */
export const getSponsorLogoRoute = {
  method: 'POST',
  path: '/sponsors/logo',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { filename } = request.body || {};
      const s3domain = request.headers?.s3domain;
      const logo = await _sponsorService.getSponsorLogo(filename, s3domain);
      return successResponse(logo);
    } catch (error) {
      console.error('Error getting sponsor logo:', error);
      return errorResponse('Failed to get sponsor logo', 500, error.message);
    }
  }))
};

/**
 * DELETE /sponsors/:sponsorID
 * Delete affiliate sponsor
 */
export const deleteSponsorRoute = {
  method: 'DELETE',
  path: '/sponsors/:sponsorID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const sponsorID = Number(request.pathParameters.sponsorID);
      const response = await _sponsorService.deleteAffiliateSponsor(sponsorID, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error deleting sponsor:', error);
      return errorResponse('Failed to delete sponsor', 500, error.message);
    }
  }))
};

/**
 * GET /sponsors/event/:eventID
 * Get event sponsors
 */
export const getEventSponsorsRoute = {
  method: 'GET',
  path: '/sponsors/event/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const sponsors = await _sponsorService.getEventSponsors(eventID, request.vert);
      return successResponse(sponsors);
    } catch (error) {
      console.error('Error getting event sponsors:', error);
      return errorResponse('Failed to get event sponsors', 500, error.message);
    }
  }))
};

/**
 * GET /sponsors/event/:eventID/sponsor/:sponsorID/level/:levelID
 * Get event sponsor
 */
export const getEventSponsorRoute = {
  method: 'GET',
  path: '/sponsors/event/:eventID/sponsor/:sponsorID/level/:levelID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const sponsorID = Number(request.pathParameters.sponsorID);
      const levelID = Number(request.pathParameters.levelID);
      const sponsor = await _sponsorService.getEventSponsor(eventID, sponsorID, levelID, request.vert);
      return successResponse(sponsor);
    } catch (error) {
      console.error('Error getting event sponsor:', error);
      return errorResponse('Failed to get event sponsor', 500, error.message);
    }
  }))
};

/**
 * GET /sponsors/event/:eventID/sponsor/:sponsorID/resources/:section
 * Get event sponsor resources
 */
export const getEventSponsorResourcesRoute = {
  method: 'GET',
  path: '/sponsors/event/:eventID/sponsor/:sponsorID/resources/:section',
  handler: requireAuth(async (request) => {
    try {
      const section = request.pathParameters.section;
      const userID = Number(request.session?.user_id);
      const eventID = Number(request.pathParameters.eventID);
      const sponsorID = Number(request.pathParameters.sponsorID);
      const vert = request.headers?.vert;
      
      const result = await _sponsorService.getEventSponsorResources(
        section,
        userID,
        eventID,
        sponsorID,
        vert
      );
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event sponsor resources:', error);
      return errorResponse('Failed to get event sponsor resources', 500, error.message);
    }
  })
};

/**
 * PUT /sponsors/event/move
 * Move event sponsor
 */
export const moveEventSponsorRoute = {
  method: 'PUT',
  path: '/sponsors/event/move',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { eventID, sponsorID, levelID, sortOrder } = request.body || {};
      const response = await _sponsorService.moveEventSponsor(
        Number(eventID),
        Number(sponsorID),
        Number(levelID),
        Number(sortOrder),
        request.vert
      );
      return successResponse(response);
    } catch (error) {
      console.error('Error moving event sponsor:', error);
      return errorResponse('Failed to move event sponsor', 500, error.message);
    }
  }))
};

/**
 * PUT /sponsors/event/sponsor/:sponsorID/level/:levelID
 * Update event sponsor
 */
export const updateEventSponsorRoute = {
  method: 'PUT',
  path: '/sponsors/event/sponsor/:sponsorID/level/:levelID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const sponsorID = Number(request.pathParameters.sponsorID);
      const levelID = Number(request.pathParameters.levelID);
      const response = await _sponsorService.updateEventSponsor(sponsorID, levelID, request.body, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error updating event sponsor:', error);
      return errorResponse('Failed to update event sponsor', 500, error.message);
    }
  }))
};

// Sponsor Levels routes
export const getEventSponsorLevelsRoute = {
  method: 'GET',
  path: '/sponsors/levels/event/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const levels = await _sponsorService.getEventSponsorLevels(eventID, request.vert);
      return successResponse(levels);
    } catch (error) {
      console.error('Error getting event sponsor levels:', error);
      return errorResponse('Failed to get event sponsor levels', 500, error.message);
    }
  }))
};

export const createSponsorLevelRoute = {
  method: 'POST',
  path: '/sponsors/levels/event/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const newLevel = await _sponsorService.createSponsorLevel(eventID, request.body, request.vert);
      if (newLevel.success) {
        return successResponse(newLevel);
      } else {
        return errorResponse(newLevel.message || 'Failed to create sponsor level', 400);
      }
    } catch (error) {
      console.error('Error creating sponsor level:', error);
      return errorResponse('Failed to create sponsor level', 500, error.message);
    }
  }))
};

export const moveSponsorLevelRoute = {
  method: 'PUT',
  path: '/sponsors/levels/move',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { eventID, levelID, sortOrder } = request.body || {};
      const response = await _sponsorService.moveSponsorLevel(
        Number(eventID),
        Number(levelID),
        Number(sortOrder),
        request.vert
      );
      return successResponse(response);
    } catch (error) {
      console.error('Error moving sponsor level:', error);
      return errorResponse('Failed to move sponsor level', 500, error.message);
    }
  }))
};

export const addSponsorToLevelRoute = {
  method: 'POST',
  path: '/sponsors/levels/sponsor',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { sponsorID, levelID } = request.body || {};
      const affiliateID = Number(request.session?.affiliate_id);
      const response = await _sponsorService.addSponsorToLevel(
        Number(sponsorID),
        Number(levelID),
        affiliateID,
        request.vert
      );
      return successResponse(response);
    } catch (error) {
      console.error('Error adding sponsor to level:', error);
      return errorResponse('Failed to add sponsor to level', 500, error.message);
    }
  }))
};

export const updateSponsorLevelRoute = {
  method: 'PUT',
  path: '/sponsors/levels/:levelID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const levelID = Number(request.pathParameters.levelID);
      const response = await _sponsorService.updateSponsorLevel(levelID, request.body, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error updating sponsor level:', error);
      return errorResponse('Failed to update sponsor level', 500, error.message);
    }
  }))
};

export const deleteSponsorLevelRoute = {
  method: 'DELETE',
  path: '/sponsors/levels/:levelID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const levelID = Number(request.pathParameters.levelID);
      const response = await _sponsorService.deleteSponsorLevel(levelID, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error deleting sponsor level:', error);
      return errorResponse('Failed to delete sponsor level', 500, error.message);
    }
  }))
};

export const removeSponsorFromLevelRoute = {
  method: 'DELETE',
  path: '/sponsors/levels/:levelID/sponsor/:sponsorID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const levelID = Number(request.pathParameters.levelID);
      const sponsorID = Number(request.pathParameters.sponsorID);
      const response = await _sponsorService.removeSponsorFromLevel(levelID, sponsorID, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error removing sponsor from level:', error);
      return errorResponse('Failed to remove sponsor from level', 500, error.message);
    }
  }))
};

// Live Meeting routes
export const addLiveMeetingRoute = {
  method: 'POST',
  path: '/sponsors/meetings',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { eventID, sponsorID, meetings } = request.body || {};
      const response = await _sponsorService.addLiveMeeting(
        Number(eventID),
        Number(sponsorID),
        meetings,
        request.vert
      );
      return successResponse(response);
    } catch (error) {
      console.error('Error adding live meeting:', error);
      return errorResponse('Failed to add live meeting', 500, error.message);
    }
  }))
};

export const deleteLiveMeetingRoute = {
  method: 'DELETE',
  path: '/sponsors/meetings/:meetingID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const meetingID = Number(request.pathParameters.meetingID);
      const response = await _sponsorService.deleteLiveMeeting(meetingID, request.vert);
      return successResponse(response);
    } catch (error) {
      console.error('Error deleting live meeting:', error);
      return errorResponse('Failed to delete live meeting', 500, error.message);
    }
  }))
};

