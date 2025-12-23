/**
 * Change tracking routes migrated from Mantle change-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import ChangeService from '../services/ChangeService.js';

const _changeService = new ChangeService();

/**
 * GET /changes/attendee/:attendeeID
 * Get registration tracking activity by Attendee ID
 */
export const getAttendeeChangeActivityRoute = {
  method: 'GET',
  path: '/changes/attendee/:attendeeID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _changeService.getAttendeeChangeActivity(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting attendee change activity:', error);
      return errorResponse('Failed to get change activity', 500, error.message);
    }
  }))
};

/**
 * GET /changes/event/:eventID
 * Get event configuration change tracking activity by Event ID
 */
export const getEventChangeActivityRoute = {
  method: 'GET',
  path: '/changes/event/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _changeService.getEventChangeActivity(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting event change activity:', error);
      return errorResponse('Failed to get event change activity', 500, error.message);
    }
  }))
};

/**
 * GET /changes/affiliate/:affiliateID
 * Get affiliate change tracking activity by Affiliate ID
 */
export const getAffiliateChangeActivityRoute = {
  method: 'GET',
  path: '/changes/affiliate/:affiliateID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _changeService.getAffiliateChangeActivity(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting affiliate change activity:', error);
      return errorResponse('Failed to get affiliate change activity', 500, error.message);
    }
  }))
};

