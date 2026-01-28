/**
 * Ratings routes migrated from Mantle ratings-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _ratingsService from '../services/RatingsService.js';

/**
 * GET /ratings/session-by-slot/:eventID/:slotID
 * Get session ratings by slot
 */
export const getSessionBySlotRoute = {
  method: 'GET',
  path: '/ratings/session-by-slot/:eventID/:slotID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _ratingsService.getSessionBySlotID(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error getting session by slot:', error);
      return errorResponse('Failed to get session ratings', 500, error.message);
    }
  }))
};

/**
 * POST /ratings/session-by-slot/:eventID/:slotID
 * Save session ratings by slot
 */
export const saveSessionBySlotRoute = {
  method: 'POST',
  path: '/ratings/session-by-slot/:eventID/:slotID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _ratingsService.saveSessionBySlotID(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error saving session ratings:', error);
      return errorResponse('Failed to save session ratings', 500, error.message);
    }
  }))
};

