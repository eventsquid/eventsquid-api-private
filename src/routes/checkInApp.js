/**
 * Check-In App routes migrated from Mantle checkInApp-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import CheckInAppService from '../services/CheckInAppService.js';

const _checkInAppService = new CheckInAppService();

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
      return successResponse(result);
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
      return successResponse(result);
    } catch (error) {
      console.error('Error updating check-in app preferences:', error);
      return errorResponse('Failed to update preferences', 500, error.message);
    }
  }))
};

