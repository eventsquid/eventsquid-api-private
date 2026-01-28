/**
 * Import routes migrated from Mantle import-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _importService from '../services/ImportService.js';

/**
 * POST /import/travel/:eventID/:profileID
 * Import attendee's travel data
 */
export const importTravelFieldsRoute = {
  method: 'POST',
  path: '/import/travel/:eventID/:profileID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _importService.importTravelFields(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error importing travel fields:', error);
      return errorResponse('Failed to import travel fields', 500, error.message);
    }
  }))
};

