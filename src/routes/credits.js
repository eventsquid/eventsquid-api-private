/**
 * Credits routes
 * Migrated from credits-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate, verticalCheck } from '../middleware/auth.js';
import CreditsService from '../services/CreditsService.js';

const creditsService = new CreditsService();

// Get credits by user ID
export const getCreditsByUserIDRoute = {
  method: 'GET',
  path: '/credits/userID/:userID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { userID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await creditsService.getCreditsByUserID(userID, vert);
    return createResponse(200, result);
  }
};

// Get CE events by user ID
export const getCEEventsByUserIDRoute = {
  method: 'GET',
  path: '/credits/new/userID/:userID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { userID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await creditsService.getCEEventsByUserID(userID, vert);
    return createResponse(200, result);
  }
};

// Get event credit categories
export const getEventCreditCategoriesRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    let categories = await creditsService.getEventCreditCategories(
      Number(eventID),
      request.queryStringParameters || {},
      vert
    );
    if ('active' in (request.queryStringParameters || {})) {
      categories = categories.filter(category => !category.archived);
    }
    return createResponse(200, categories);
  }
};

// Get event credit categories assignment grid
export const getEventCreditCategoriesAssignmentGridRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/assignmentGrid',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const categories = await creditsService.getEventCreditCategoriesAssignmentGrid(Number(eventID), vert);
    return createResponse(200, categories);
  }
};

// Get event credit categories credit library
export const getEventCreditCategoriesCreditLibraryRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/creditLibrary',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const categories = await creditsService.getEventCreditCategoriesCreditLibrary(Number(eventID), vert);
    return createResponse(200, categories);
  }
};

// Get event credit categories grant dashboard
export const getEventCreditCategoriesGrantDashboardRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/grantDashboard',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const categories = await creditsService.getEventCreditCategoriesGrantDashboard(Number(eventID), vert);
    return createResponse(200, categories);
  }
};

// Get event credit categories criteria form
export const getEventCreditCategoriesCriteriaFormRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/criteriaForm',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    let categories = await creditsService.getEventCreditCategoriesCriteriaForm(
      Number(eventID),
      request.queryStringParameters || {},
      vert
    );
    if ('active' in (request.queryStringParameters || {})) {
      categories = categories.filter(category => !category.archived);
    }
    return createResponse(200, categories);
  }
};

// Get event credit categories report
export const getEventCreditCategoriesReportRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/report',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    let categories = await creditsService.getEventCreditCategoriesReport(Number(eventID), vert);
    if ('active' in (request.queryStringParameters || {})) {
      categories = categories.filter(category => !category.archived);
    }
    return createResponse(200, categories);
  }
};

// Get unused categories
export const getUnusedCategoriesRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/unusedCategories',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const categories = await creditsService.getUnusedCategories(Number(eventID), vert);
    return createResponse(200, categories);
  }
};

// Update credit category
export const updateCreditCategoryRoute = {
  method: 'PUT',
  path: '/credits/category/:catID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { catID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const update = await creditsService.updateCreditCategory(Number(catID), request.body, vert);
    return createResponse(200, update);
  }
};

// Create credit category
export const createCreditCategoryRoute = {
  method: 'POST',
  path: '/credits/category',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const update = await creditsService.createCreditCategory(request.body, vert);
    return createResponse(200, update);
  }
};

// Archive credit category
export const archiveCreditCategoryRoute = {
  method: 'PUT',
  path: '/credits/category/archive/:catID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { catID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const category = await creditsService.archiveCreditCategory(Number(catID), request.body, vert);
    return createResponse(200, category);
  }
};

// Get awarded attendees by category
export const getAwardedAttendeesByCategoryRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/awardedAttendees/:categoryID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, categoryID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const categories = await creditsService.getAwardedAttendeesByCategory(
      Number(eventID),
      Number(categoryID),
      vert
    );
    return createResponse(200, categories);
  }
};

// Get sessions by category
export const getSessionsByCategoryRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/sessions/:categoryID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, categoryID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const sessions = await creditsService.getSessionsByCategory(Number(eventID), Number(categoryID), vert);
    return createResponse(200, sessions);
  }
};

// Get grants by category
export const getGrantsByCategoryRoute = {
  method: 'GET',
  path: '/credits/:eventID/categories/grants/:categoryID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, categoryID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const grants = await creditsService.getGrantsByCategory(Number(eventID), Number(categoryID), vert);
    return createResponse(200, grants);
  }
};

// Get award criteria packages
export const getAwardCriteriaPackagesRoute = {
  method: 'GET',
  path: '/credits/:eventID/packages',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const packages = await creditsService.getAwardCriteriaPackages(
      { eventID: Number(eventID) },
      vert
    );
    return createResponse(200, packages);
  }
};

// Create award criteria package
export const createAwardCriteriaPackageRoute = {
  method: 'POST',
  path: '/credits/:eventID/packages',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const newPackage = await creditsService.createAwardCriteriaPackage(
      Number(eventID),
      request.body,
      vert
    );
    return createResponse(200, newPackage);
  }
};

// Get award criteria package
export const getAwardCriteriaPackageRoute = {
  method: 'GET',
  path: '/credits/:eventID/packages/:packageID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, packageID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const packageData = await creditsService.getAwardCriteriaPackages({
      eventID: Number(eventID),
      packageID: Number(packageID)
    }, vert);
    return createResponse(200, packageData.length ? packageData[0] : {});
  }
};

// Delete award criteria package
export const deleteAwardCriteriaPackageRoute = {
  method: 'DELETE',
  path: '/credits/:eventID/packages/:packageID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, packageID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const response = await creditsService.deleteAwardCriteriaPackage(
      Number(eventID),
      Number(packageID),
      vert
    );
    return createResponse(200, response);
  }
};

// Edit award criteria package
export const editAwardCriteriaPackageRoute = {
  method: 'PUT',
  path: '/credits/:eventID/packages/:packageID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, packageID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await creditsService.editAwardCriteriaPackage(
      Number(eventID),
      Number(packageID),
      request.body,
      vert
    );
    return createResponse(200, result);
  }
};

// Reset award criteria package
export const resetAwardCriteriaPackageRoute = {
  method: 'PUT',
  path: '/credits/:eventID/packages/:packageID/reset',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, packageID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await creditsService.resetAwardCriteriaPackage(
      Number(eventID),
      Number(packageID),
      vert
    );
    return createResponse(200, result);
  }
};

// Get attendees to award
export const getAttendeesToAwardRoute = {
  method: 'GET',
  path: '/credits/:eventID/packages/:packageID/attendeesToAward/categories/:categoryID/sessions/:sessionID',
  handler: async (request) => {
    await authenticate(request);
    const { packageID, categoryID, sessionID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const attendees = await creditsService.getAttendeesToAward(
      Number(packageID),
      vert,
      null,
      Number(categoryID),
      Number(sessionID)
    );
    return createResponse(200, attendees);
  }
};

// Get attendees to decline
export const getAttendeesToDeclineRoute = {
  method: 'GET',
  path: '/credits/:eventID/packages/:packageID/attendeesToDecline/categories/:categoryID/sessions/:sessionID',
  handler: async (request) => {
    await authenticate(request);
    const { packageID, categoryID, sessionID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const attendees = await creditsService.getAttendeesToDecline(
      Number(packageID),
      vert,
      null,
      Number(categoryID),
      Number(sessionID)
    );
    return createResponse(200, attendees);
  }
};

// Get exception log
export const getExceptionLogRoute = {
  method: 'GET',
  path: '/credits/:eventID/packages/:packageID/exceptionLog/categories/:categoryID/sessions/:sessionID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, packageID, categoryID, sessionID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const pending = 'pending' in (request.queryStringParameters || {}) ? 1 : 0;
    const logData = await creditsService.getExceptionLog(
      Number(eventID),
      Number(packageID),
      Number(categoryID),
      Number(sessionID),
      pending,
      vert
    );
    return createResponse(200, logData);
  }
};

// Add award exception
export const addAwardExceptionRoute = {
  method: 'POST',
  path: '/credits/:eventID/packages/exceptionLog',
  handler: async (request) => {
    await authenticate(request);
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const newException = await creditsService.addAwardException(request.body, vert);
    return createResponse(200, newException);
  }
};

// Update award exception
export const updateAwardExceptionRoute = {
  method: 'PUT',
  path: '/credits/:eventID/exceptionLog/:logID',
  handler: async (request) => {
    await authenticate(request);
    const { logID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await creditsService.updateAwardException(Number(logID), request.body, vert);
    return createResponse(200, result);
  }
};

// Remove award exception
export const removeAwardExceptionRoute = {
  method: 'DELETE',
  path: '/credits/:eventID/exceptionLog/:logID',
  handler: async (request) => {
    await authenticate(request);
    const { logID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const response = await creditsService.removeAwardException(Number(logID), vert);
    return createResponse(200, response);
  }
};

// Get transcript template
export const getTranscriptTemplateRoute = {
  method: 'GET',
  path: '/credits/transcript-template/:eventID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const edit = 'edit' in (request.queryStringParameters || {});
    const preview = 'preview' in (request.queryStringParameters || {});
    const templateString = await creditsService.getTranscriptTemplate(
      edit,
      preview,
      Number(eventID),
      0,
      vert
    );
    return createResponse(200, templateString, 'text/html');
  }
};

// Get transcript template by user
export const getTranscriptTemplateByUserRoute = {
  method: 'GET',
  path: '/credits/transcript-template/:eventID/user/:userID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, userID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const edit = 'edit' in (request.queryStringParameters || {});
    const preview = 'preview' in (request.queryStringParameters || {});
    const templateString = await creditsService.getTranscriptTemplate(
      edit,
      preview,
      Number(eventID),
      Number(userID),
      vert
    );
    return createResponse(200, templateString, 'text/html');
  }
};

// Get transcript template external view
export const getTranscriptTemplateExternalViewRoute = {
  method: 'GET',
  path: '/credits/transcript-template/:eventID/user/:userID/externalView',
  handler: async (request) => {
    // No auth required for external view
    const { eventID, userID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const edit = 'edit' in (request.queryStringParameters || {});
    const preview = 'preview' in (request.queryStringParameters || {});
    const templateString = await creditsService.getTranscriptTemplate(
      edit,
      preview,
      Number(eventID),
      Number(userID),
      vert
    );
    return createResponse(200, templateString, 'text/html');
  }
};

// Run cron scheduled runs
export const runCronScheduledRunsRoute = {
  method: 'GET',
  path: '/credits/grants',
  handler: async (request) => {
    await authenticate(request);
    const verts = request.headers?.['verts'] || request.headers?.['Verts'] || request.headers?.['VERTS'];
    const runs = await creditsService.runCronScheduledRuns(verts);
    return createResponse(200, runs);
  }
};

// Get cron scheduled runs
export const getCronScheduledRunsRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/cronRuns',
  handler: async (request) => {
    await authenticate(request);
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const scheduledRuns = await creditsService.getCronScheduledRuns(vert);
    return createResponse(200, scheduledRuns);
  }
};

// Get scheduled runs
export const getScheduledRunsRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/scheduled',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const scheduledRuns = await creditsService.getScheduledRuns(Number(eventID), vert);
    return createResponse(200, scheduledRuns);
  }
};

// Create grant
export const createGrantRoute = {
  method: 'POST',
  path: '/credits/:eventID/grants',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const newGrant = await creditsService.createGrant(Number(eventID), request.body, vert);
    return createResponse(200, newGrant);
  }
};

// Remove scheduled run
export const removeScheduledRunRoute = {
  method: 'PUT',
  path: '/credits/:eventID/grants/:grantID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, grantID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const response = await creditsService.removeScheduledRun(Number(eventID), Number(grantID), vert);
    return createResponse(200, response);
  }
};

// Get recent runs
export const getRecentRunsRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/recent',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const scheduled = 'scheduled' in (request.queryStringParameters || {}) ? 'scheduled' : 'manual';
    const recentRuns = await creditsService.getRecentRuns(Number(eventID), scheduled, vert);
    return createResponse(200, recentRuns);
  }
};

// Get recent run details
export const getRecentRunDetailsRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/recent/:logID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, logID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const recentRun = await creditsService.getRecentRunDetails(Number(eventID), Number(logID), vert);
    return createResponse(200, recentRun);
  }
};

// Get affected attendees count
export const getAffectedAttendeesCountRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/affectedAttendeesCount/:packageID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, packageID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const testMode = Number(request.queryStringParameters?.testMode || 0);
    const attendeesCount = await creditsService.getAffectedAttendeesCount(
      Number(eventID),
      Number(packageID),
      testMode,
      vert
    );
    return createResponse(200, attendeesCount ? attendeesCount.affectedCount : 0);
  }
};

// Get awarded attendees
export const getAwardedAttendeesRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/awardedAttendees/:logID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, logID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const attendees = await creditsService.getAwardedAttendees(Number(eventID), Number(logID), vert);
    return createResponse(200, attendees);
  }
};

// Get declined attendees
export const getDeclinedAttendeesRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/declinedAttendees/:logID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, logID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const attendees = await creditsService.getDeclinedAttendees(Number(eventID), Number(logID), vert);
    return createResponse(200, attendees);
  }
};

// Get awarded by reg item ID
export const getAwardedByRegItemIDRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/awardedAttendees/:logID/cat/:catID/item/:itemID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, logID, catID, itemID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const attendees = await creditsService.getAwardedByRegItemID(
      Number(eventID),
      Number(logID),
      Number(catID),
      Number(itemID),
      vert
    );
    return createResponse(200, attendees);
  }
};

// Get declined by reg item ID
export const getDeclinedByRegItemIDRoute = {
  method: 'GET',
  path: '/credits/:eventID/grants/declinedAttendees/:logID/cat/:catID/item/:itemID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, logID, catID, itemID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const attendees = await creditsService.getDeclinedByRegItemID(
      Number(eventID),
      Number(logID),
      Number(catID),
      Number(itemID),
      vert
    );
    return createResponse(200, attendees);
  }
};

// Unaward attendee
export const unawardAttendeeRoute = {
  method: 'PUT',
  path: '/credits/:eventID/grants/unawardAttendee/:awardID',
  handler: async (request) => {
    await authenticate(request);
    const { eventID, awardID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const response = await creditsService.unawardAttendee(Number(eventID), Number(awardID), vert);
    return createResponse(200, response);
  }
};

// Get event sessions
export const getEventSessionsRoute = {
  method: 'GET',
  path: '/credits/:eventID/sessions',
  handler: async (request) => {
    await authenticate(request);
    const { eventID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const sessions = await creditsService.getEventSessions(Number(eventID), vert);
    return createResponse(200, sessions);
  }
};

