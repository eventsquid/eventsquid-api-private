/**
 * Verification routes migrated from Mantle verification-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';
import VerificationService from '../services/VerificationService.js';

const _verificationService = new VerificationService();

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
      return successResponse(result);
    } catch (error) {
      console.error('Error verifying code:', error);
      return errorResponse('Failed to verify code', 500, error.message);
    }
  })
};

