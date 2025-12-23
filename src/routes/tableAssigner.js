/**
 * Table Assigner routes migrated from Mantle tableAssigner-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import TableAssignerService from '../services/TableAssignerService.js';

const _tableAssignerService = new TableAssignerService();

/**
 * POST /tableAssigner/config/:vert
 * Save Table Assigner Config
 */
export const saveTableAssignerConfigRoute = {
  method: 'POST',
  path: '/tableAssigner/config/:vert',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      let result = await _tableAssignerService.insertTableAssignerConfig(
        request.pathParameters,
        request.body?.[0]
      );
      result = await _tableAssignerService.insertTableAssignerData(
        request.pathParameters,
        request.body?.[1]
      );
      return successResponse(result);
    } catch (error) {
      console.error('Error saving table assigner config:', error);
      return errorResponse('Failed to save config', 500, error.message);
    }
  }))
};

/**
 * GET /tableAssigner/config/:vert/all/:eventID
 * Find all configurations for an event
 */
export const getTableAssignerConfigsByEventRoute = {
  method: 'GET',
  path: '/tableAssigner/config/:vert/all/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _tableAssignerService.findTableAssignerConfigsByEvent(
        request.pathParameters,
        request.body
      );
      return successResponse(result);
    } catch (error) {
      console.error('Error getting table assigner configs:', error);
      return errorResponse('Failed to get configs', 500, error.message);
    }
  }))
};

/**
 * PUT /tableAssigner/config/:vert/:groupingID
 * Update Table Assigner Config by ID
 */
export const updateTableAssignerConfigRoute = {
  method: 'PUT',
  path: '/tableAssigner/config/:vert/:groupingID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      let result = await _tableAssignerService.updateTableAssignerConfig(
        request.pathParameters,
        request.body?.[0]
      );
      result = await _tableAssignerService.updateTableAssignerData(
        request.pathParameters,
        request.body?.[1]
      );
      return successResponse(result);
    } catch (error) {
      console.error('Error updating table assigner config:', error);
      return errorResponse('Failed to update config', 500, error.message);
    }
  }))
};

/**
 * GET /tableAssigner/config/:vert/:groupingID
 * Find Table Assigner Config by ID
 */
export const getTableAssignerConfigRoute = {
  method: 'GET',
  path: '/tableAssigner/config/:vert/:groupingID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _tableAssignerService.findTableAssignerConfig(request.pathParameters);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting table assigner config:', error);
      return errorResponse('Failed to get config', 500, error.message);
    }
  }))
};

/**
 * DELETE /tableAssigner/config/:vert/:groupingID
 * Delete Table Assigner Config by ID
 */
export const deleteTableAssignerConfigRoute = {
  method: 'DELETE',
  path: '/tableAssigner/config/:vert/:groupingID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      let result = await _tableAssignerService.deleteTableAssignerConfig(request.pathParameters);
      result = await _tableAssignerService.deleteTableAssignerData(request.pathParameters);
      return successResponse(result);
    } catch (error) {
      console.error('Error deleting table assigner config:', error);
      return errorResponse('Failed to delete config', 500, error.message);
    }
  }))
};

/**
 * POST /tableAssigner/assignment/:vert
 * Add Table Assigner Assignment
 */
export const addTableAssignerAssignmentRoute = {
  method: 'POST',
  path: '/tableAssigner/assignment/:vert',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _tableAssignerService.insertTableAssignerData(
        request.pathParameters,
        request.body
      );
      return successResponse(result);
    } catch (error) {
      console.error('Error adding table assigner assignment:', error);
      return errorResponse('Failed to add assignment', 500, error.message);
    }
  }))
};

/**
 * PUT /tableAssigner/assignment/:vert/:groupingID
 * Update Table Assigner Assignments by groupingID
 */
export const updateTableAssignerAssignmentRoute = {
  method: 'PUT',
  path: '/tableAssigner/assignment/:vert/:groupingID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _tableAssignerService.updateTableAssignerData(
        request.pathParameters,
        request.body
      );
      return successResponse(result);
    } catch (error) {
      console.error('Error updating table assigner assignment:', error);
      return errorResponse('Failed to update assignment', 500, error.message);
    }
  }))
};

/**
 * GET /tableAssigner/assignment/:vert/:groupingID
 * Find Table Assigner Assignments by groupingID
 */
export const getTableAssignerAssignmentRoute = {
  method: 'GET',
  path: '/tableAssigner/assignment/:vert/:groupingID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _tableAssignerService.findTableAssignerData(request.pathParameters);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting table assigner assignment:', error);
      return errorResponse('Failed to get assignment', 500, error.message);
    }
  }))
};

/**
 * GET /tableAssigner/assignment/byEvent/:vert/:eventID
 * Find table Assigner Assignments by eventID
 */
export const getTableAssignerAssignmentByEventRoute = {
  method: 'GET',
  path: '/tableAssigner/assignment/byEvent/:vert/:eventID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _tableAssignerService.findTableAssignerDataByEvent(request.pathParameters);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting table assigner assignment by event:', error);
      return errorResponse('Failed to get assignment by event', 500, error.message);
    }
  }))
};

/**
 * DELETE /tableAssigner/assignment/:vert/:groupingID
 * Delete Table Assigner Assignments by groupingID
 */
export const deleteTableAssignerAssignmentRoute = {
  method: 'DELETE',
  path: '/tableAssigner/assignment/:vert/:groupingID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const result = await _tableAssignerService.deleteTableAssignerData(request.pathParameters);
      return successResponse(result);
    } catch (error) {
      console.error('Error deleting table assigner assignment:', error);
      return errorResponse('Failed to delete assignment', 500, error.message);
    }
  }))
};

/**
 * PUT /tableAssigner/config/:vert/attendees/:eventID/:contestantID/cancel
 * Cancel attendee table assignment
 */
export const cancelAttendeeTableAssignmentRoute = {
  method: 'PUT',
  path: '/tableAssigner/config/:vert/attendees/:eventID/:contestantID/cancel',
  handler: requireAuth(async (request) => {
    try {
      const result = await _tableAssignerService.cancelAttendee(request.pathParameters);
      return successResponse(result);
    } catch (error) {
      console.error('Error canceling attendee table assignment:', error);
      return errorResponse('Failed to cancel assignment', 500, error.message);
    }
  })
};

