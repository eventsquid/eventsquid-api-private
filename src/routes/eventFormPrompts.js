/**
 * Event Form Prompts routes migrated from Mantle eventFormPrompts-controller.js
 * Note: These routes use MSSQL and need MSSQL connection utility
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import EventService from '../services/EventService.js';

const _eventService = new EventService();

/**
 * GET /eventFormPrompts/:vert/:eventID/:profileID
 * Get all form prompts by Event ID and Profile ID
 * Note: This route uses MSSQL - needs MSSQL connection utility
 */
export const getEventFormPromptsRoute = {
  method: 'GET',
  path: '/eventFormPrompts/:vert/:eventID/:profileID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      // TODO: Migrate full implementation
      // This route requires MSSQL connection and complex query logic
      // For now, return placeholder
      console.log('getEventFormPrompts called - MSSQL required');
      return errorResponse('Event form prompts endpoint requires MSSQL connection - not yet migrated', 501);
    } catch (error) {
      console.error('Error getting event form prompts:', error);
      return errorResponse('Failed to get event form prompts', 500, error.message);
    }
  }))
};

/**
 * POST /eventFormPrompts/:vert/:eventID/:profileID
 * Save event form prompts
 */
export const saveEventFormPromptsRoute = {
  method: 'POST',
  path: '/eventFormPrompts/:vert/:eventID/:profileID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { fieldType } = request.body || {};
      let returnObj = {};
      
      // If this is a standard prompt
      if (fieldType === 'standard') {
        returnObj = await _eventService.saveEventStandardPrompts(request);
      } else if (fieldType === 'custom') {
        // If it's a custom prompt
        returnObj = await _eventService.saveEventCustomPrompts(request);
      }
      
      return successResponse(returnObj);
    } catch (error) {
      console.error('Error saving event form prompts:', error);
      return errorResponse('Failed to save event form prompts', 500, error.message);
    }
  }))
};

