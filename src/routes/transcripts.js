/**
 * Transcript routes migrated from Mantle transcript-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';
import CreditsService from '../services/CreditsService.js';

const _creditsService = new CreditsService();

/**
 * GET /transcripts/:eventID
 * Get transcript template config
 */
export const getTranscriptConfigRoute = {
  method: 'GET',
  path: '/transcripts/:eventID',
  handler: requireAuth(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.headers?.vert;
      const config = await _creditsService.getTranscriptTemplateConfig(eventID, vert);
      return successResponse(config);
    } catch (error) {
      console.error('Error getting transcript config:', error);
      return errorResponse('Failed to get transcript config', 500, error.message);
    }
  })
};

/**
 * PUT /transcripts/:eventID
 * Save transcript config
 */
export const saveTranscriptConfigRoute = {
  method: 'PUT',
  path: '/transcripts/:eventID',
  handler: requireAuth(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const vert = request.headers?.vert;
      const transcriptID = await _creditsService.saveTranscriptConfig(eventID, request.body, vert);
      
      return successResponse({
        success: transcriptID != null,
        message: `Updated/Created ${transcriptID}`
      });
    } catch (error) {
      console.error('Error saving transcript config:', error);
      return errorResponse('Failed to save transcript config', 500, error.message);
    }
  })
};

