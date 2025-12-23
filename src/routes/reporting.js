/**
 * Reporting routes
 * Migrated from reporting-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import ReportingService from '../services/ReportingService.js';

const reportingService = new ReportingService();

// Get report layouts by event GUID
export const findReportLayoutsByEventRoute = {
  method: 'GET',
  path: '/reporting/report-layouts/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.findReportLayoutsByEvent(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Get CEU Summary Report layouts by event GUID
export const findCEUSummaryReportLayoutsByEventRoute = {
  method: 'GET',
  path: '/reporting/report-layouts/:eventGUID/ceu-summary',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.findCEUSummaryReportLayoutsByEvent(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Get CEU Detail Report layouts by event GUID
export const findCEUDetailReportLayoutsByEventRoute = {
  method: 'GET',
  path: '/reporting/report-layouts/:eventGUID/ceu-detail',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.findCEUDetailReportLayoutsByEvent(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Get report layouts by event GUID and categories
export const findReportLayoutsByEventAndCategoryRoute = {
  method: 'GET',
  path: '/reporting/report-layouts-by-cat/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.findReportLayoutsByEventAndCategory(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Get report layout details
export const findReportLayoutRoute = {
  method: 'GET',
  path: '/reporting/report-layout/:reportID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.findReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Save report layout
export const upsertReportLayoutRoute = {
  method: 'POST',
  path: '/reporting/report-layout/:reportID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.upsertReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Delete report layout
export const deleteReportLayoutRoute = {
  method: 'DELETE',
  path: '/reporting/report-layout/:reportID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.deleteReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Delete CEU Summary Report layout
export const deleteCEUSummaryReportLayoutRoute = {
  method: 'DELETE',
  path: '/reporting/report-layout/summary-report/:reportID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.deleteCEUSummaryReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Delete CEU Detail Report layout
export const deleteCEUDetailReportLayoutRoute = {
  method: 'DELETE',
  path: '/reporting/report-layout/detail-report/:reportID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.deleteCEUDetailReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Get report layout categories
export const findReportCategoriesRoute = {
  method: 'GET',
  path: '/reporting/report-layout-categories',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.findReportCategories(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Update report layout categories by event GUID
export const updateReportCategoryByEventRoute = {
  method: 'PUT',
  path: '/reporting/report-layout-categories/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportingService.updateReportCategoryByEvent(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

