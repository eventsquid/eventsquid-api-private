/**
 * Verification routes migrated from Mantle verification-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _verificationService from '../services/VerificationService.js';

/**
 * POST /verify
 * Get verification id
 */
export const verifyCodeRoute = {
  method: 'POST',
  path: '/verify',
  handler: requireAuth(async (request) => {
    try {
      const result = await _verificationService.verifyCode(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error verifying code:', error);
      return errorResponse('Failed to verify code', 500, error.message);
    }
  })
};

