/**
 * QR routes migrated from Mantle qr-controller.js
 * Public API endpoints - no auth required
 */

import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _qrService from '../services/QRService.js';

/**
 * GET /qr/mobileAttendeeQR/:vert/:attendeeGUID
 * Generate mobile attendee QR code (Public endpoint)
 */
export const generateMobileAttendeeQRRoute = {
  method: 'GET',
  path: '/qr/mobileAttendeeQR/:vert/:attendeeGUID',
  handler: async (request) => {
    try {
      const result = await _qrService.generateMobileAttendeeQR(request);
      // QR service returns image data, so return it directly
      if (result && result.statusCode) {
        return result;
      }
      return createResponse(200, result);
    } catch (error) {
      console.error('Error generating mobile attendee QR:', error);
      return errorResponse('Failed to generate QR code', 500, error.message);
    }
  }
};

/**
 * GET /qr/mobileSpecQR/:vert/:orderGUID
 * Generate mobile spectator QR code (Public endpoint)
 */
export const generateMobileSpecQRRoute = {
  method: 'GET',
  path: '/qr/mobileSpecQR/:vert/:orderGUID',
  handler: async (request) => {
    try {
      const result = await _qrService.generateMobileSpecQR(request);
      if (result && result.statusCode) {
        return result;
      }
      return createResponse(200, result);
    } catch (error) {
      console.error('Error generating mobile spec QR:', error);
      return errorResponse('Failed to generate QR code', 500, error.message);
    }
  }
};

/**
 * GET /qr/checkinSpectator/:vert/:orderGUID/:ticketItemGUID
 * Generate check-in spectator QR code (Public endpoint)
 */
export const generateCheckinSpecQRRoute = {
  method: 'GET',
  path: '/qr/checkinSpectator/:vert/:orderGUID/:ticketItemGUID',
  handler: async (request) => {
    try {
      const result = await _qrService.generateCheckinSpecQR(request);
      if (result && result.statusCode) {
        return result;
      }
      return createResponse(200, result);
    } catch (error) {
      console.error('Error generating check-in spec QR:', error);
      return errorResponse('Failed to generate QR code', 500, error.message);
    }
  }
};

