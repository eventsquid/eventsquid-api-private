/**
 * Download routes migrated from Mantle download-controller.js
 * Public endpoint - no auth required
 */

import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _downloadService from '../services/DownloadService.js';

/**
 * GET /download/:fileGUID/:checkID
 * Download file (Public endpoint)
 */
export const downloadFileRoute = {
  method: 'GET',
  path: '/download/:fileGUID/:checkID',
  handler: async (request) => {
    try {
      const result = await _downloadService.downloadFile(request);
      // Download service returns file data, so return it directly
      if (result && result.statusCode) {
        return result;
      }
      return createResponse(200, result);
    } catch (error) {
      console.error('Error downloading file:', error);
      return errorResponse('Failed to download file', 500, error.message);
    }
  }
};

