/**
 * Contact Scan App routes migrated from Mantle contactScanApp-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import ContactScanAppService from '../services/ContactScanAppService.js';

const _contactScanAppService = new ContactScanAppService();

/**
 * GET /contactScanApp/preferences/:eventID
 * Get contact scan app preferences
 */
export const getContactScanAppPreferencesRoute = {
  method: 'GET',
  path: '/contactScanApp/preferences/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _contactScanAppService.getPreferences(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting contact scan app preferences:', error);
      return errorResponse('Failed to get preferences', 500, error.message);
    }
  }))
};

/**
 * PUT /contactScanApp/preferences/:eventID
 * Update contact scan app preferences
 */
export const updateContactScanAppPreferencesRoute = {
  method: 'PUT',
  path: '/contactScanApp/preferences/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _contactScanAppService.updatePreferences(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating contact scan app preferences:', error);
      return errorResponse('Failed to update preferences', 500, error.message);
    }
  }))
};

/**
 * PUT /contactScanApp/preferencesAPI/:eventID
 * Update contact scan app API preferences
 */
export const updateContactScanAppAPIPreferencesRoute = {
  method: 'PUT',
  path: '/contactScanApp/preferencesAPI/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _contactScanAppService.updateAPIPreferences(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating contact scan app API preferences:', error);
      return errorResponse('Failed to update API preferences', 500, error.message);
    }
  }))
};

