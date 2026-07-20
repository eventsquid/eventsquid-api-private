/**
 * Attendee routes migrated from Mantle attendee-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import _attendeeService from '../services/AttendeeService.js';

/**
 * POST /attendee/attendees-pivoted
 * Get Pivoted Attendees specifying filters
 */
export const findPivotedAttendeesRoute = {
  method: 'POST',
  path: '/attendee/attendees-pivoted',
  handler: requireAuth(async (request) => {
    try {
      const result = await _attendeeService.findAndPivotAttendees(request);
      // Return the array directly without wrapper
      return createResponse(200, result);
    } catch (error) {
      console.error('Error finding pivoted attendees:', error);
      return errorResponse('Failed to find pivoted attendees', 500, error.message);
    }
  })
};

/**
 * POST /attendee/:vert
 * Get Attendees specifying filters (body: { filter?, resultset?, columns?, limit? })
 */
export const findAttendeesRoute = {
  method: 'POST',
  path: '/attendee/:vert',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.findAttendees(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error finding attendees:', error);
      return errorResponse('Failed to find attendees', 500, error.message);
    }
  }))
};

/**
 * GET /attendee/:vert
 * Get Attendees (same as POST but filter/resultset from query params for easy browser/curl).
 * Query: resultset=grouptool (default), filter=JSON string (optional), limit=number (optional)
 */
export const findAttendeesGetRoute = {
  method: 'GET',
  path: '/attendee/:vert',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const q = request.queryStringParameters || {};
      if (!request.body || (typeof request.body === 'object' && Object.keys(request.body).length === 0)) {
        let filter = {};
        try {
          if (q.filter && typeof q.filter === 'string') {
            filter = JSON.parse(q.filter);
          }
        } catch (e) {
          console.warn('[attendee] Invalid filter query JSON, using {}');
        }
        request.body = {
          resultset: q.resultset || 'grouptool',
          filter,
          limit: q.limit != null ? Number(q.limit) : undefined
        };
      }
      const result = await _attendeeService.findAttendees(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error finding attendees:', error);
      return errorResponse('Failed to find attendees', 500, error.message);
    }
  }))
};

/**
 * DELETE /attendee/:vert/:contestantID/prompts
 * Delete a custom prompt response from an Attendee
 */
export const deleteAttendeePromptResponseRoute = {
  method: 'DELETE',
  path: '/attendee/:vert/:contestantID/prompts',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.deleteAttendeePromptResponse(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error deleting attendee prompt response:', error);
      return errorResponse('Failed to delete prompt response', 500, error.message);
    }
  }))
};

/**
 * PUT /attendee/:vert/:contestantID/prompts
 * Record a custom prompt response from an Attendee
 */
export const updateAttendeePromptResponseRoute = {
  method: 'PUT',
  path: '/attendee/:vert/:contestantID/prompts',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.updateAttendeePromptResponse(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating attendee prompt response:', error);
      return errorResponse('Failed to update prompt response', 500, error.message);
    }
  }))
};

/**
 * POST /attendee/:contestantID/eventDocs
 * Update attendee event documents
 */
export const updateAttendeeEventDocsRoute = {
  method: 'POST',
  path: '/attendee/:contestantID/eventDocs',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.updateAttendeeEventDocs(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating attendee event docs:', error);
      return errorResponse('Failed to update event docs', 500, error.message);
    }
  }))
};

/**
 * GET /attendee/util-obj/:attendeeID
 * Get attendee utility object
 */
export const findAttendeeObjRoute = {
  method: 'GET',
  path: '/attendee/util-obj/:attendeeID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.findAttendeeObjByAPI(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error finding attendee obj:', error);
      return errorResponse('Failed to find attendee object', 500, error.message);
    }
  }))
};

/**
 * POST /attendee/last-upd/:attendeeID
 * Update attendee last updated timestamp
 */
export const updateAttendeeLURoute = {
  method: 'POST',
  path: '/attendee/last-upd/:attendeeID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.updateAttendeeLU(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating attendee last updated:', error);
      return errorResponse('Failed to update last updated', 500, error.message);
    }
  }))
};

/**
 * POST /attendee/last-upd-by-user/:userID
 * Update attendee last updated by user
 */
export const updateAttendeeLUbyUserRoute = {
  method: 'POST',
  path: '/attendee/last-upd-by-user/:userID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.updateAttendeeLUbyUser(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating attendee last updated by user:', error);
      return errorResponse('Failed to update last updated by user', 500, error.message);
    }
  }))
};

/**
 * POST /attendee/last-upd-by-user-event/:userID/:eventID
 * Update attendee last updated by user and event
 */
export const updateAttendeeLUbyUserAndEventRoute = {
  method: 'POST',
  path: '/attendee/last-upd-by-user-event/:userID/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _attendeeService.updateAttendeeLUbyUserAndEvent(request);
      return createResponse(200, result);
    } catch (error) {
      console.error('Error updating attendee last updated by user and event:', error);
      return errorResponse('Failed to update last updated', 500, error.message);
    }
  }))
};

