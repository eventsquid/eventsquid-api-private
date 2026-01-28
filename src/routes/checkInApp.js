/**
 * Check-In App routes migrated from Mantle checkInApp-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _checkInAppService from '../services/CheckInAppService.js';

/**
 * GET /checkInApp/preferences/:eventID
 * Get check-in app preferences
 */
export const getCheckInAppPreferencesRoute = {
  method: 'GET',
  path: '/checkInApp/preferences/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _checkInAppService.getPreferences(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting check-in app preferences:', error);
      return errorResponse('Failed to get preferences', 500, error.message);
    }
  }))
};

/**
 * PUT /checkInApp/preferences/:eventID
 * Update check-in app preferences
 */
export const updateCheckInAppPreferencesRoute = {
  method: 'PUT',
  path: '/checkInApp/preferences/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _checkInAppService.updatePreferences(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating check-in app preferences:', error);
      return errorResponse('Failed to update preferences', 500, error.message);
    }
  }))
};

