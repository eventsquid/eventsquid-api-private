/**
 * Root routes migrated from Mantle root-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { utcToTimezone, timezoneToUTC } from '../functions/conversions.js';
import RootService from '../services/RootService.js';

const _rootService = new RootService();

/**
 * POST /utcToEventZone
 * Convert UTC date to event timezone
 */
export const utcToEventZoneRoute = {
  method: 'POST',
  path: '/utcToEventZone',
  handler: requireAuth(async (request) => {
    try {
      const { date, zone, format } = request.body || {};
      
      if (!date || !zone) {
        return errorResponse('date and zone are required', 400);
      }
      
      const convertedDate = utcToTimezone(new Date(date), zone, format || 'YYYY-MM-DD HH:mm:ss');
      
      return successResponse({ date: convertedDate });
    } catch (error) {
      console.error('Error in utcToEventZone:', error);
      return errorResponse('Failed to convert timezone', 500, error.message);
    }
  })
};

/**
 * POST /timezoneToUTC
 * Convert timezone date to UTC
 */
export const timezoneToUTCRoute = {
  method: 'POST',
  path: '/timezoneToUTC',
  handler: requireAuth(async (request) => {
    try {
      const { date, zone, format } = request.body || {};
      
      if (!date || !zone) {
        return errorResponse('date and zone are required', 400);
      }
      
      const utcDate = timezoneToUTC(new Date(date), zone, format || 'YYYY-MM-DD HH:mm:ss');
      
      return successResponse({ date: utcDate });
    } catch (error) {
      console.error('Error in timezoneToUTC:', error);
      return errorResponse('Failed to convert to UTC', 500, error.message);
    }
  })
};

/**
 * GET /jurisdictions
 * Get jurisdictions list
 */
export const jurisdictionsRoute = {
  method: 'GET',
  path: '/jurisdictions',
  handler: requireAuth(async (request) => {
    try {
      const jurisdictions = await _rootService.getJurisdictions();
      
      return successResponse(jurisdictions);
    } catch (error) {
      console.error('Error getting jurisdictions:', error);
      return errorResponse('Failed to get jurisdictions', 500, error.message);
    }
  })
};

// Note: /images/:vert route is complex and involves S3, MSSQL, and MongoDB
// Will need to migrate separately after setting up AWS SDK and MSSQL connections

