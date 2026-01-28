/**
 * Registration Items routes migrated from Mantle regitems-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _regItemsService from '../services/RegItemsService.js';
import _eventService from '../services/EventService.js';

/**
 * GET /regitems/:eventID/fees
 * Get event fees
 */
export const getEventFeesRoute = {
  method: 'GET',
  path: '/regitems/:eventID/fees',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const fees = await _regItemsService.getEventFeesByEvent(
        eventID,
        request.queryStringParameters || {},
        request.vert
      );
      return createResponse(200, fees);
    } catch (error) {
      console.error('Error getting event fees:', error);
      return errorResponse('Failed to get event fees', 500, error.message);
    }
  }))
};

/**
 * POST /regitems/:eventID/item/:eventFeeID
 * Update event fee
 */
export const updateEventFeeRoute = {
  method: 'POST',
  path: '/regitems/:eventID/item/:eventFeeID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventFeeID = Number(request.pathParameters.eventFeeID);
      const result = await _regItemsService.updateEventFee(
        eventFeeID,
        request.body,
        request.vert
      );
      
      await _eventService.updateRegItems(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating event fee:', error);
      return errorResponse('Failed to update event fee', 500, error.message);
    }
  }))
};

/**
 * DELETE /regitems/ce-link/:ceuEventFeeID
 * Delete reg item CEU link
 */
export const deleteRegItemCEURoute = {
  method: 'DELETE',
  path: '/regitems/ce-link/:ceuEventFeeID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const ceuEventFeeID = Number(request.pathParameters.ceuEventFeeID);
      const result = await _regItemsService.deleteRegItemCEU(ceuEventFeeID, request.vert);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error deleting reg item CEU:', error);
      return errorResponse('Failed to delete reg item CEU', 500, error.message);
    }
  }))
};

/**
 * PUT /regitems/ce-link/:ceuEventFeeID
 * Update reg item CEU link
 */
export const updateRegItemCEURoute = {
  method: 'PUT',
  path: '/regitems/ce-link/:ceuEventFeeID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const ceuEventFeeID = Number(request.pathParameters.ceuEventFeeID);
      const result = await _regItemsService.updateRegItemCEU(
        request.body,
        ceuEventFeeID,
        request.vert
      );
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating reg item CEU:', error);
      return errorResponse('Failed to update reg item CEU', 500, error.message);
    }
  }))
};

/**
 * POST /regitems/:eventFeeID/ce-link
 * Add reg item CEU link
 */
export const addRegItemCEURoute = {
  method: 'POST',
  path: '/regitems/:eventFeeID/ce-link',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventFeeID = Number(request.pathParameters.eventFeeID);
      const result = await _regItemsService.addRegItemCeu(
        request.body,
        eventFeeID,
        request.vert
      );
      return createResponse(200, result);
    } catch (error) {
      console.error('Error adding reg item CEU:', error);
      return errorResponse('Failed to add reg item CEU', 500, error.message);
    }
  }))
};

/**
 * PUT /regitems/:eventID/items/clear-codes
 * Clear check-in/out codes
 */
export const clearCheckInOutCodesRoute = {
  method: 'PUT',
  path: '/regitems/:eventID/items/clear-codes',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      await _regItemsService.clearCheckInOutCodes(
        eventID,
        request.body,
        request.vert
      );
      
      await _eventService.updateRegItems(request);
      // Match old codebase: return empty array
      return createResponse(200, []);
    } catch (error) {
      console.error('Error clearing check-in/out codes:', error);
      return errorResponse('Failed to clear codes', 500, error.message);
    }
  }))
};

/**
 * PUT /regitems/:eventID/items/generate-codes
 * Generate check-in/out codes
 */
export const generateCheckInOutCodesRoute = {
  method: 'PUT',
  path: '/regitems/:eventID/items/generate-codes',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const result = await _regItemsService.generateCheckInOutCodes(
        eventID,
        request.body,
        request.vert
      );
      
      await _eventService.updateRegItems(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error generating check-in/out codes:', error);
      return errorResponse('Failed to generate codes', 500, error.message);
    }
  }))
};

