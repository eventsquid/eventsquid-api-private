/**
 * Reports routes
 * Migrated from reports-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate, verticalCheck } from '../middleware/auth.js';
import ReportService from '../services/ReportService.js';

const reportService = new ReportService();

// Get event details by GUID
export const getEventDetailsByGUIDRoute = {
  method: 'GET',
  path: '/reports/event-details/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.getEventDetailsByGUID(request);
    return createResponse(200, result);
  }
};

// Get report details by GUID
export const getReportDetailsByGUIDRoute = {
  method: 'GET',
  path: '/reports/report-details/:reportGUID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.getReportDetailsByGUID(request);
    return createResponse(200, result);
  }
};

// Get reporting menu
export const getReportingMenuRoute = {
  method: 'GET',
  path: '/reports/report-menu/:eventID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.getReportingMenu(request);
    return createResponse(200, result);
  }
};

// Get registrant report (GET)
export const getRegistrantReportRoute = {
  method: 'GET',
  path: '/reports/registrant/:eventID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.registrantReport(request);
    return createResponse(200, result);
  }
};

// Get registrant report (POST)
export const postRegistrantReportRoute = {
  method: 'POST',
  path: '/reports/registrant/:eventID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.registrantReport(request);
    return createResponse(200, result);
  }
};

// Export registrant report
export const exportRegistrantReportRoute = {
  method: 'GET',
  path: '/reports/registrant/:reportGUID/export/:format/:checkID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.registrantReportExport(request);
    return createResponse(200, result);
  }
};

// Get registrant filters
export const getRegistrantFiltersRoute = {
  method: 'GET',
  path: '/reports/registrant/:eventID/filters',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.getRegistrantFilters(request);
    return createResponse(200, result);
  }
};

// Save registrant template
export const saveRegistrantTemplateRoute = {
  method: 'POST',
  path: '/reports/registrant/:eventID/template',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.saveRegistrantTemplate(request);
    return createResponse(200, result);
  }
};

// Get registrant templates
export const getRegistrantTemplatesRoute = {
  method: 'GET',
  path: '/reports/registrant/:eventID/templates',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.getRegistrantTemplates(request);
    return createResponse(200, result);
  }
};

// Get registrant transactions report
export const getRegistrantTransactionsReportRoute = {
  method: 'POST',
  path: '/reports/registrant-transactions',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const reqDetails = {
      affiliateID: request.body.affiliateID,
      eventID: request.body.eventID,
      keyword: request.body.keyword,
      fromDate: request.body.fromDate,
      toDate: request.body.toDate,
      payMethod: request.body.payMethod,
      vert: request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT']
    };
    const result = await reportService.getRegistrantTransactionsReport(reqDetails);
    return createResponse(200, result);
  }
};

// Check duplicate template name
export const checkDupTemplateNameRoute = {
  method: 'GET',
  path: '/reports/template/:reportType/:eventID/dupe-check/:templateName',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.checkDupTemplateName(request);
    return createResponse(200, result);
  }
};

// Delete template
export const deleteTemplateRoute = {
  method: 'DELETE',
  path: '/reports/template/:reportType/:eventID/:idg',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.deleteTemplate(request);
    return createResponse(200, result);
  }
};

// Share template
export const shareTemplateRoute = {
  method: 'POST',
  path: '/reports/share/template',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.shareTemplate(request);
    return createResponse(200, result);
  }
};

// Get bios by event ID
export const getBiosByEventIDRoute = {
  method: 'GET',
  path: '/reports/bios-by-event/:eventID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await reportService.getBiosByEventID(request);
    return createResponse(200, result);
  }
};

// Find event report config
export const findEventReportConfigRoute = {
  method: 'POST',
  path: '/reports/:eventGUID/report-config',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportService.findEventReportConfig(request);
      return createResponse(200, result);
    } catch (error) {
      console.log('error', error);
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Get CEU Summary Report
export const getCEUSummaryReportRoute = {
  method: 'GET',
  path: '/reports/:eventID/ceu-summary-report',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const data = await reportService.getCEUSummaryReport(eventID, request.queryStringParameters || {}, vert);
    return createResponse(200, data);
  }
};

// Get CEU Summary Report filters
export const getCEUSummaryReportFiltersRoute = {
  method: 'GET',
  path: '/reports/:eventGUID/ceu-summary-report/config/:reportID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const data = await reportService.getCEUSummaryReportFilters(request);
    return createResponse(200, data);
  }
};

// Save CEU Summary Report Layout
export const saveCEUSummaryReportLayoutRoute = {
  method: 'POST',
  path: '/reports/ceu-summary-report/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportService.saveCEUSummaryReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Update CEU Summary Report Layout
export const updateCEUSummaryReportLayoutRoute = {
  method: 'PUT',
  path: '/reports/ceu-summary-report/:eventGUID/report/:reportID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportService.updateCEUSummaryReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Get CEU Detail Report
export const getCEUDetailReportRoute = {
  method: 'GET',
  path: '/reports/:eventID/ceu-detail-report',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const data = await reportService.getCEUDetailReport(eventID, request.queryStringParameters || {}, vert);
    return createResponse(200, data);
  }
};

// Get CEU Detail Report filters
export const getCEUDetailReportFiltersRoute = {
  method: 'GET',
  path: '/reports/:eventGUID/ceu-detail-report/config/:reportID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const data = await reportService.getCEUDetailReportFilters(request);
    return createResponse(200, data);
  }
};

// Save CEU Detail Report Layout
export const saveCEUDetailReportLayoutRoute = {
  method: 'POST',
  path: '/reports/ceu-detail-report/:eventGUID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportService.saveCEUDetailReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Update CEU Detail Report Layout
export const updateCEUDetailReportLayoutRoute = {
  method: 'PUT',
  path: '/reports/ceu-detail-report/:eventGUID/report/:reportID',
  handler: async (request) => {
    await authenticate(request);
    try {
      const result = await reportService.updateCEUDetailReportLayout(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

