/**
 * Custom Fields routes migrated from Mantle customFields-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _customFieldsService from '../services/CustomFieldsService.js';

/**
 * POST /customFields/:fieldID
 * Save Custom Field Changes
 */
export const saveCustomFieldRoute = {
  method: 'POST',
  path: '/customFields/:fieldID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const fieldID = Number(request.pathParameters.fieldID);
      const affiliateID = Number(request.session?.affiliate_id);
      const vert = request.vert;
      
      const result = await _customFieldsService.saveChanges(affiliateID, fieldID, vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error saving custom field:', error);
      return errorResponse('Failed to save custom field', 500, error.message);
    }
  }))
};

/**
 * GET /customFields/:eventID
 * Get custom fields by event
 */
export const getCustomFieldsByEventRoute = {
  method: 'GET',
  path: '/customFields/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.vert;
      const type = request.queryStringParameters?.type;
      
      let results = await _customFieldsService.getCustomFieldsByEvent(eventID, vert);
      
      if (type) {
        results = results.filter(field => field.fieldInput === type);
      }
      
      return createResponse(200, results);
    } catch (error) {
      console.error('Error getting custom fields:', error);
      return errorResponse('Failed to get custom fields', 500, error.message);
    }
  }))
};

