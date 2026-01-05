/**
 * Route definitions
 * Migrated from Mantle application
 */

import { createResponse } from '../utils/response.js';
import { utcToEventZoneRoute, timezoneToUTCRoute, jurisdictionsRoute, postImagesRoute } from './root.js';
import {
  findEventsRoute,
  updateCustomPromptsRoute,
  getEventDataRoute,
  getEventProfilesRoute,
  updateEventRoute,
  getEventDurationRoute,
  updateEventTimezoneDataRoute,
  updateFeeTimezoneDataRoute,
  updateEventSpeakersRoute,
  updateRegItemsRoute,
  updateTimestampRoute,
  generateEventICSRoute,
  generateEventFeeICSRoute,
  touchEventRoute,
  autoDeactivateFeesRoute,
  resetViewCountsRoute,
  getCEUConfigRoute,
  getEventUploadsRoute,
  getEventLibraryRoute,
  getEventLibraryVideoRoute,
  getEventVideoRoute
} from './events.js';
import {
  findPivotedAttendeesRoute,
  findAttendeesRoute,
  deleteAttendeePromptResponseRoute,
  updateAttendeePromptResponseRoute,
  updateAttendeeEventDocsRoute,
  findAttendeeObjRoute,
  updateAttendeeLURoute,
  updateAttendeeLUbyUserRoute,
  updateAttendeeLUbyUserAndEventRoute
} from './attendees.js';
import {
  deletePermissionsRoute,
  savePermissionsRoute
} from './api.js';
import {
  getAgendaSlotsRoute,
  addSponsorToSlotRoute,
  toggleSponsorSlotBindingRoute,
  removeSponsorFromSlotRoute,
  getGroupedAgendaSlotsRoute,
  getVEOAgendaDataRoute,
  getAgendaSlotRoute,
  getMobileSlotResourcesRoute
} from './agenda.js';
import {
  getEventFeesRoute,
  updateEventFeeRoute,
  deleteRegItemCEURoute,
  updateRegItemCEURoute,
  addRegItemCEURoute,
  clearCheckInOutCodesRoute,
  generateCheckInOutCodesRoute
} from './regitems.js';
import {
  getAttendeeRegActivityRoute
} from './activity.js';
import {
  generateMobileAttendeeQRRoute,
  generateMobileSpecQRRoute,
  generateCheckinSpecQRRoute
} from './qr.js';
import {
  getSessionBySlotRoute,
  saveSessionBySlotRoute
} from './ratings.js';
import {
  verifyCodeRoute
} from './verification.js';
import {
  getAttendeeChangeActivityRoute,
  getEventChangeActivityRoute,
  getAffiliateChangeActivityRoute
} from './changes.js';
import {
  saveCustomFieldRoute,
  getCustomFieldsByEventRoute
} from './customFields.js';
import {
  getEventFormPromptsRoute,
  saveEventFormPromptsRoute
} from './eventFormPrompts.js';
import {
  getInvitationFormDataRoute,
  getInvitationCountsRoute,
  auditInviteesRoute,
  getInviteesRoute,
  getTemplatesRoute,
  deleteTemplateRoute
} from './invitations.js';
import {
  createSponsorRoute,
  updateSponsorRoute,
  getAffiliateSponsorsRoute,
  getSponsorLogoRoute,
  deleteSponsorRoute,
  getEventSponsorsRoute,
  getEventSponsorRoute,
  getEventSponsorResourcesRoute,
  moveEventSponsorRoute,
  updateEventSponsorRoute,
  getEventSponsorLevelsRoute,
  createSponsorLevelRoute,
  moveSponsorLevelRoute,
  addSponsorToLevelRoute,
  updateSponsorLevelRoute,
  deleteSponsorLevelRoute,
  removeSponsorFromLevelRoute,
  addLiveMeetingRoute,
  deleteLiveMeetingRoute
} from './sponsors.js';
import {
  downloadFileRoute
} from './download.js';
import {
  getCheckInAppPreferencesRoute,
  updateCheckInAppPreferencesRoute
} from './checkInApp.js';
import {
  getContactScanAppPreferencesRoute,
  updateContactScanAppPreferencesRoute,
  updateContactScanAppAPIPreferencesRoute
} from './contactScanApp.js';
import {
  getPendingTransactionsRoute,
  getPendingTransactionsByAffiliateRoute,
  updatePendingTransactionsRoute
} from './chron.js';
import {
  importTravelFieldsRoute
} from './import.js';
import {
  getTranscriptConfigRoute,
  saveTranscriptConfigRoute
} from './transcripts.js';
import {
  saveTableAssignerConfigRoute,
  getTableAssignerConfigsByEventRoute,
  updateTableAssignerConfigRoute,
  getTableAssignerConfigRoute,
  deleteTableAssignerConfigRoute,
  addTableAssignerAssignmentRoute,
  updateTableAssignerAssignmentRoute,
  getTableAssignerAssignmentRoute,
  getTableAssignerAssignmentByEventRoute,
  deleteTableAssignerAssignmentRoute,
  cancelAttendeeTableAssignmentRoute
} from './tableAssigner.js';
import {
  sendUnconfirmedPaymentAlertsRoute,
  getAffiliateGatewaysRoute,
  updateGatewayRoute,
  deleteGatewayRoute,
  getAvailableGatewaysRoute,
  resetPaymentProcessorRoute
} from './payment.js';
import {
  getPublicKeyByAttendeeRoute,
  getPublicKeyByAffiliateRoute,
  payByCreditCardRoute,
  refundTransactionRoute as authNetRefundTransactionRoute,
  getTransactionDetailsRoute,
  testRecordRefundRoute,
  checkMultiCheckoutRoute,
  getPaymentFormRoute
} from './authNet.js';
import {
  logEmailRoute,
  validateEmailRoute,
  verifyEmailRoute,
  findEmailsByStatusRoute,
  findEmailsByTypeRoute,
  findEmailCountsByStatusRoute,
  findEmailLogByAffiliateRoute,
  getInvitationEmailsRoute,
  getInvitationEmailsByStatusRoute,
  getNotificationEmailsRoute,
  getContestantEmailsRoute,
  getEmailListFromAPIRoute,
  importEmailDetailFromAPIRoute,
  sendEmailVerificationCodeRoute,
  getUserPhoneRoute
} from './email.js';
import {
  getEventDetailsByGUIDRoute,
  getReportDetailsByGUIDRoute,
  getReportingMenuRoute,
  getRegistrantReportRoute,
  postRegistrantReportRoute,
  exportRegistrantReportRoute,
  getRegistrantFiltersRoute,
  saveRegistrantTemplateRoute,
  getRegistrantTemplatesRoute,
  getRegistrantTransactionsReportRoute,
  checkDupTemplateNameRoute,
  deleteTemplateRoute as deleteReportTemplateRoute,
  shareTemplateRoute,
  getBiosByEventIDRoute,
  findEventReportConfigRoute,
  getCEUSummaryReportRoute,
  getCEUSummaryReportFiltersRoute,
  saveCEUSummaryReportLayoutRoute,
  updateCEUSummaryReportLayoutRoute,
  getCEUDetailReportRoute,
  getCEUDetailReportFiltersRoute,
  saveCEUDetailReportLayoutRoute,
  updateCEUDetailReportLayoutRoute
} from './reports.js';
import {
  getCreditsByUserIDRoute,
  getCEEventsByUserIDRoute,
  getEventCreditCategoriesRoute,
  getEventCreditCategoriesAssignmentGridRoute,
  getEventCreditCategoriesCreditLibraryRoute,
  getEventCreditCategoriesGrantDashboardRoute,
  getEventCreditCategoriesCriteriaFormRoute,
  getEventCreditCategoriesReportRoute,
  getUnusedCategoriesRoute,
  updateCreditCategoryRoute,
  createCreditCategoryRoute,
  archiveCreditCategoryRoute,
  getAwardedAttendeesByCategoryRoute,
  getSessionsByCategoryRoute,
  getGrantsByCategoryRoute,
  getAwardCriteriaPackagesRoute,
  createAwardCriteriaPackageRoute,
  getAwardCriteriaPackageRoute,
  deleteAwardCriteriaPackageRoute,
  editAwardCriteriaPackageRoute,
  resetAwardCriteriaPackageRoute,
  getAttendeesToAwardRoute,
  getAttendeesToDeclineRoute,
  getExceptionLogRoute,
  addAwardExceptionRoute,
  updateAwardExceptionRoute,
  removeAwardExceptionRoute,
  getTranscriptTemplateRoute,
  getTranscriptTemplateByUserRoute,
  getTranscriptTemplateExternalViewRoute,
  runCronScheduledRunsRoute,
  getCronScheduledRunsRoute,
  getScheduledRunsRoute,
  createGrantRoute,
  removeScheduledRunRoute,
  getRecentRunsRoute,
  getRecentRunDetailsRoute,
  getAffectedAttendeesCountRoute,
  getAwardedAttendeesRoute,
  getDeclinedAttendeesRoute,
  getAwardedByRegItemIDRoute,
  getDeclinedByRegItemIDRoute,
  unawardAttendeeRoute,
  getEventSessionsRoute
} from './credits.js';
import {
  findReportLayoutsByEventRoute,
  findCEUSummaryReportLayoutsByEventRoute,
  findCEUDetailReportLayoutsByEventRoute,
  findReportLayoutsByEventAndCategoryRoute,
  findReportLayoutRoute,
  upsertReportLayoutRoute,
  deleteReportLayoutRoute,
  deleteCEUSummaryReportLayoutRoute,
  deleteCEUDetailReportLayoutRoute,
  findReportCategoriesRoute,
  updateReportCategoryByEventRoute
} from './reporting.js';

// Health check route
const healthCheck = {
  method: 'GET',
  path: '/health',
  handler: async (request) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'eventsquid-api',
      environment: process.env.NODE_ENV || 'unknown'
    };
  }
};

// Export all routes
export const routes = [
  healthCheck,
  // Root routes
  utcToEventZoneRoute,
  timezoneToUTCRoute,
  jurisdictionsRoute,
  postImagesRoute,
  // Event routes (19 routes - all migrated including resource routes)
  findEventsRoute,
  updateCustomPromptsRoute,
  getEventDataRoute,
  getEventProfilesRoute,
  updateEventRoute,
  getEventDurationRoute,
  updateEventTimezoneDataRoute,
  updateFeeTimezoneDataRoute,
  updateEventSpeakersRoute,
  updateRegItemsRoute,
  updateTimestampRoute,
  generateEventICSRoute,
  generateEventFeeICSRoute,
  touchEventRoute,
  autoDeactivateFeesRoute,
  resetViewCountsRoute,
  getCEUConfigRoute,
  getEventUploadsRoute,
  getEventLibraryRoute,
  getEventLibraryVideoRoute,
  getEventVideoRoute,
  // Attendee routes (9 routes)
  findPivotedAttendeesRoute,
  findAttendeesRoute,
  deleteAttendeePromptResponseRoute,
  updateAttendeePromptResponseRoute,
  updateAttendeeEventDocsRoute,
  findAttendeeObjRoute,
  updateAttendeeLURoute,
  updateAttendeeLUbyUserRoute,
  updateAttendeeLUbyUserAndEventRoute,
  // API routes (2 routes)
  deletePermissionsRoute,
  savePermissionsRoute,
  // Agenda routes (8 routes)
  getAgendaSlotsRoute,
  addSponsorToSlotRoute,
  toggleSponsorSlotBindingRoute,
  removeSponsorFromSlotRoute,
  getGroupedAgendaSlotsRoute,
  getVEOAgendaDataRoute,
  getAgendaSlotRoute,
  getMobileSlotResourcesRoute,
  // Registration Items routes (7 routes)
  getEventFeesRoute,
  updateEventFeeRoute,
  deleteRegItemCEURoute,
  updateRegItemCEURoute,
  addRegItemCEURoute,
  clearCheckInOutCodesRoute,
  generateCheckInOutCodesRoute,
  // Activity routes (1 route)
  getAttendeeRegActivityRoute,
  // QR routes (3 routes - public endpoints)
  generateMobileAttendeeQRRoute,
  generateMobileSpecQRRoute,
  generateCheckinSpecQRRoute,
  // Ratings routes (2 routes)
  getSessionBySlotRoute,
  saveSessionBySlotRoute,
  // Verification routes (1 route)
  verifyCodeRoute,
  // Change tracking routes (3 routes)
  getAttendeeChangeActivityRoute,
  getEventChangeActivityRoute,
  getAffiliateChangeActivityRoute,
  // Custom Fields routes (2 routes)
  saveCustomFieldRoute,
  getCustomFieldsByEventRoute,
  // Event Form Prompts routes (2 routes - 1 needs MSSQL)
  getEventFormPromptsRoute,
  saveEventFormPromptsRoute,
  // Invitations routes (6 routes)
  getInvitationFormDataRoute,
  getInvitationCountsRoute,
  auditInviteesRoute,
  getInviteesRoute,
  getTemplatesRoute,
  deleteTemplateRoute,
  // Sponsors routes (18 routes - includes levels and meetings)
  createSponsorRoute,
  updateSponsorRoute,
  getAffiliateSponsorsRoute,
  getSponsorLogoRoute,
  deleteSponsorRoute,
  getEventSponsorsRoute,
  getEventSponsorRoute,
  getEventSponsorResourcesRoute,
  moveEventSponsorRoute,
  updateEventSponsorRoute,
  getEventSponsorLevelsRoute,
  createSponsorLevelRoute,
  moveSponsorLevelRoute,
  addSponsorToLevelRoute,
  updateSponsorLevelRoute,
  deleteSponsorLevelRoute,
  removeSponsorFromLevelRoute,
  addLiveMeetingRoute,
  deleteLiveMeetingRoute,
  // Download routes (1 route - public)
  downloadFileRoute,
  // Check-In App routes (2 routes)
  getCheckInAppPreferencesRoute,
  updateCheckInAppPreferencesRoute,
  // Contact Scan App routes (3 routes)
  getContactScanAppPreferencesRoute,
  updateContactScanAppPreferencesRoute,
  updateContactScanAppAPIPreferencesRoute,
  // Chron (Cron) routes (3 routes)
  getPendingTransactionsRoute,
  getPendingTransactionsByAffiliateRoute,
  updatePendingTransactionsRoute,
  // Import routes (1 route)
  importTravelFieldsRoute,
  // Transcript routes (2 routes)
  getTranscriptConfigRoute,
  saveTranscriptConfigRoute,
  // Table Assigner routes (10 routes)
  saveTableAssignerConfigRoute,
  getTableAssignerConfigsByEventRoute,
  updateTableAssignerConfigRoute,
  getTableAssignerConfigRoute,
  deleteTableAssignerConfigRoute,
  addTableAssignerAssignmentRoute,
  updateTableAssignerAssignmentRoute,
  getTableAssignerAssignmentRoute,
  getTableAssignerAssignmentByEventRoute,
  deleteTableAssignerAssignmentRoute,
  cancelAttendeeTableAssignmentRoute,
  // SMS routes (4 routes)
  logTwilioStatusRoute,
  sendMessageRoute,
  findMessageRoute,
  sendVerificationCodeRoute,
  // Stripe routes (1 route)
  logStripePaymentRoute,
  // Transaction routes (2 routes)
  findTransactionByGatewayRoute,
  findTransactionsByContestantRoute,
  // Vantiv/Worldpay routes (2 routes)
  transactionSetupRoute,
  refundTransactionRoute,
  // VEO routes (16 routes)
  getShareURLByEventIDRoute,
  connectorGetOptionsRoute,
  connectorSaveOptionRoute,
  getOptionsRoute,
  saveOptionRoute,
  getSlotRatingsConfigRoute,
  checkUsageRoute,
  setUsageRoute,
  getAttendeeInstructionsRoute,
  getConfigDataRoute,
  schedulingGridGetSlotsRoute,
  schedulingGridExportSlotsRoute,
  schedulingGridGetVenuesRoute,
  schedulingGridGetRoomsByAffiliateRoute,
  checkActiveRoute,
  getVeoResourcesRoute,
  // Affiliate routes (11 routes)
  getAffiliateResourcesGroupedRoute,
  addDocumentToAffiliateRoute,
  addVideoToAffiliateRoute,
  replaceDocumentRoute,
  updateAffiliateResourceRoute,
  checkResourceLinksRoute,
  deleteAffiliateResourceRoute,
  updateAffiliateResourceCategoryRoute,
  deleteAffiliateResourceCategoryRoute,
  createAffiliateResourceCategoryRoute,
  getSurveysRoute,
  // Payment routes (6 routes)
  sendUnconfirmedPaymentAlertsRoute,
  getAffiliateGatewaysRoute,
  updateGatewayRoute,
  deleteGatewayRoute,
  getAvailableGatewaysRoute,
  resetPaymentProcessorRoute,
  // AuthNet routes (8 routes)
  getPublicKeyByAttendeeRoute,
  getPublicKeyByAffiliateRoute,
  payByCreditCardRoute,
  authNetRefundTransactionRoute,
  getTransactionDetailsRoute,
  testRecordRefundRoute,
  checkMultiCheckoutRoute,
  getPaymentFormRoute,
  // Email routes (15 routes)
  logEmailRoute,
  validateEmailRoute,
  verifyEmailRoute,
  findEmailsByStatusRoute,
  findEmailsByTypeRoute,
  findEmailCountsByStatusRoute,
  findEmailLogByAffiliateRoute,
  getInvitationEmailsRoute,
  getInvitationEmailsByStatusRoute,
  getNotificationEmailsRoute,
  getContestantEmailsRoute,
  getEmailListFromAPIRoute,
  importEmailDetailFromAPIRoute,
  sendEmailVerificationCodeRoute,
  getUserPhoneRoute,
  // Reports routes (23 routes)
  getEventDetailsByGUIDRoute,
  getReportDetailsByGUIDRoute,
  getReportingMenuRoute,
  getRegistrantReportRoute,
  postRegistrantReportRoute,
  exportRegistrantReportRoute,
  getRegistrantFiltersRoute,
  saveRegistrantTemplateRoute,
  getRegistrantTemplatesRoute,
  getRegistrantTransactionsReportRoute,
  checkDupTemplateNameRoute,
  deleteReportTemplateRoute,
  shareTemplateRoute,
  getBiosByEventIDRoute,
  findEventReportConfigRoute,
  getCEUSummaryReportRoute,
  getCEUSummaryReportFiltersRoute,
  saveCEUSummaryReportLayoutRoute,
  updateCEUSummaryReportLayoutRoute,
  getCEUDetailReportRoute,
  getCEUDetailReportFiltersRoute,
  saveCEUDetailReportLayoutRoute,
  updateCEUDetailReportLayoutRoute,
  // Credits routes (44 routes)
  getCreditsByUserIDRoute,
  getCEEventsByUserIDRoute,
  getEventCreditCategoriesRoute,
  getEventCreditCategoriesAssignmentGridRoute,
  getEventCreditCategoriesCreditLibraryRoute,
  getEventCreditCategoriesGrantDashboardRoute,
  getEventCreditCategoriesCriteriaFormRoute,
  getEventCreditCategoriesReportRoute,
  getUnusedCategoriesRoute,
  updateCreditCategoryRoute,
  createCreditCategoryRoute,
  archiveCreditCategoryRoute,
  getAwardedAttendeesByCategoryRoute,
  getSessionsByCategoryRoute,
  getGrantsByCategoryRoute,
  getAwardCriteriaPackagesRoute,
  createAwardCriteriaPackageRoute,
  getAwardCriteriaPackageRoute,
  deleteAwardCriteriaPackageRoute,
  editAwardCriteriaPackageRoute,
  resetAwardCriteriaPackageRoute,
  getAttendeesToAwardRoute,
  getAttendeesToDeclineRoute,
  getExceptionLogRoute,
  addAwardExceptionRoute,
  updateAwardExceptionRoute,
  removeAwardExceptionRoute,
  getTranscriptTemplateRoute,
  getTranscriptTemplateByUserRoute,
  getTranscriptTemplateExternalViewRoute,
  runCronScheduledRunsRoute,
  getCronScheduledRunsRoute,
  getScheduledRunsRoute,
  createGrantRoute,
  removeScheduledRunRoute,
  getRecentRunsRoute,
  getRecentRunDetailsRoute,
  getAffectedAttendeesCountRoute,
  getAwardedAttendeesRoute,
  getDeclinedAttendeesRoute,
  getAwardedByRegItemIDRoute,
  getDeclinedByRegItemIDRoute,
  unawardAttendeeRoute,
  getEventSessionsRoute,
  // Reporting routes (11 routes)
  findReportLayoutsByEventRoute,
  findCEUSummaryReportLayoutsByEventRoute,
  findCEUDetailReportLayoutsByEventRoute,
  findReportLayoutsByEventAndCategoryRoute,
  findReportLayoutRoute,
  upsertReportLayoutRoute,
  deleteReportLayoutRoute,
  deleteCEUSummaryReportLayoutRoute,
  deleteCEUDetailReportLayoutRoute,
  findReportCategoriesRoute,
  updateReportCategoryByEventRoute
];

