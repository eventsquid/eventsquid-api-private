/**
 * Activity routes migrated from Mantle activity-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _activityService from '../services/ActivityService.js';

/**
 * GET /activity/attendee/:attendeeID
 * Get registration tracking activity by Attendee ID
 */
export const getAttendeeRegActivityRoute = {
  method: 'GET',
  path: '/activity/attendee/:attendeeID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _activityService.getAttendeeRegActivity(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting attendee reg activity:', error);
      return errorResponse('Failed to get attendee reg activity', 500, error.message);
    }
  }))
};

