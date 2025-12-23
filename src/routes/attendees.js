/**
 * Attendee routes migrated from Mantle attendee-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import AttendeeService from '../services/AttendeeService.js';

const _attendeeService = new AttendeeService();

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
      return successResponse(result);
    } catch (error) {
      console.error('Error finding pivoted attendees:', error);
      return errorResponse('Failed to find pivoted attendees', 500, error.message);
    }
  })
};

/**
 * POST /attendee/:vert
 * Get Attendees specifying filters
 */
export const findAttendeesRoute = {
  method: 'POST',
  path: '/attendee/:vert',
  handler: requireAuth(async (request) => {
    try {
      const result = await _attendeeService.findAttendees(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error finding attendees:', error);
      return errorResponse('Failed to find attendees', 500, error.message);
    }
  })
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
      return successResponse(result);
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
      return successResponse(result);
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
      return successResponse(result);
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
      return successResponse(result);
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
      return successResponse(result);
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
      return successResponse(result);
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
      return successResponse(result);
    } catch (error) {
      console.error('Error updating attendee last updated by user and event:', error);
      return errorResponse('Failed to update last updated', 500, error.message);
    }
  }))
};

