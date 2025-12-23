/**
 * API routes migrated from Mantle api-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import APIService from '../services/APIService.js';

const _apiService = new APIService();

/**
 * DELETE /api/permissions/:userID
 * Delete a custom prompt response from an Attendee
 */
export const deletePermissionsRoute = {
  method: 'DELETE',
  path: '/api/permissions/:userID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _apiService.deletePermissions(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error deleting permissions:', error);
      return errorResponse('Failed to delete permissions', 500, error.message);
    }
  }))
};

/**
 * POST /api/permissions/:userID
 * Record a custom prompt response from an Attendee
 */
export const savePermissionsRoute = {
  method: 'POST',
  path: '/api/permissions/:userID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      if (request.session) {
        const result = await _apiService.savePermissions(request, request.body);
        return successResponse(result);
      } else {
        return errorResponse('This endpoint requires an affiliate ID. If you are using a dev token, no session is tied to this connection', 400);
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      return errorResponse('Failed to save permissions', 500, error.message);
    }
  }))
};

