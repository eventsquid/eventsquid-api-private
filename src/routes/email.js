/**
 * Email routes
 * Migrated from email-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import EmailService from '../services/EmailService.js';

const emailService = new EmailService();

// Public endpoint - SendGrid webhook
export const logEmailRoute = {
  method: 'POST',
  path: '/email/f1c174e7-7c5f-443e-bc5c-04ab46c623df',
  handler: async (request) => {
    const result = await emailService.logEmail(request);
    return createResponse(200, result);
  }
};

// Validate email address
export const validateEmailRoute = {
  method: 'POST',
  path: '/email/validate',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.validateEmail(request);
    return createResponse(200, result);
  }
};

// Verify email address has eventsquid account
export const verifyEmailRoute = {
  method: 'POST',
  path: '/email/verify',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.verifyEmail(request);
    return createResponse(200, result);
  }
};

// Get emails by status
export const findEmailsByStatusRoute = {
  method: 'GET',
  path: '/email/status/:mailType/:id/:status',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.findEmailsByStatus(request);
    return createResponse(200, result);
  }
};

// Get emails by type
export const findEmailsByTypeRoute = {
  method: 'GET',
  path: '/email/by-type/:mailType/:id',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.findEmailsByType(request);
    return createResponse(200, result);
  }
};

// Get email counts by status
export const findEmailCountsByStatusRoute = {
  method: 'GET',
  path: '/email/counts-by-status/:mailType/:id',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.findEmailCountsByStatus(request);
    return createResponse(200, result);
  }
};

// Get email logs by affiliate
export const findEmailLogByAffiliateRoute = {
  method: 'GET',
  path: '/email/logs-by-affiliate/:affiliateID',
  handler: async (request) => {
    await authenticate(request);
    const { affiliateID } = request.pathParameters || {};
    // Set params for service method
    request.pathParameters = {
      ...request.pathParameters,
      mailType: 'commcenter',
      id: affiliateID,
      projection: { mi: 1 }
    };
    const result = await emailService.findEmailLogByAffiliate(request);
    return createResponse(200, result);
  }
};

// Get invitation logs by eventID
export const getInvitationEmailsRoute = {
  method: 'GET',
  path: '/email/invitation-mail-logs/:id',
  handler: async (request) => {
    await authenticate(request);
    request.pathParameters = {
      ...request.pathParameters,
      mailType: 'invitation'
    };
    const result = await emailService.getInvitationEmails(request);
    return createResponse(200, result);
  }
};

// Get invitation logs by status
export const getInvitationEmailsByStatusRoute = {
  method: 'GET',
  path: '/email/invitation-status/:mailID/:status',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.getInvitationEmailsByStatus(request);
    return createResponse(200, result);
  }
};

// Get notification logs by eventID
export const getNotificationEmailsRoute = {
  method: 'GET',
  path: '/email/notification-mail-logs/:vertID/:eventID',
  handler: async (request) => {
    await authenticate(request);
    request.pathParameters = {
      ...request.pathParameters,
      mailType: 'Notification'
    };
    const result = await emailService.getNotificationEmails(request);
    return createResponse(200, result);
  }
};

// Get emails by contestant
export const getContestantEmailsRoute = {
  method: 'GET',
  path: '/email/by-contestant/:contestantID',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.getContestantEmails(request);
    return createResponse(200, result);
  }
};

// Get email list from API
export const getEmailListFromAPIRoute = {
  method: 'POST',
  path: '/email/list/from-service',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.getEmailListFromAPI(request);
    return createResponse(200, result);
  }
};

// Import email detail from API
export const importEmailDetailFromAPIRoute = {
  method: 'POST',
  path: '/email/import/from-service',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.importEmailDetailFromAPI(request);
    return createResponse(200, result);
  }
};

// Send verification code
export const sendEmailVerificationCodeRoute = {
  method: 'POST',
  path: '/email/send-verify-code',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.sendVerificationCode(request);
    return createResponse(200, result);
  }
};

// Get user phone data
export const getUserPhoneRoute = {
  method: 'GET',
  path: '/email/get-user-phone/:email',
  handler: async (request) => {
    await authenticate(request);
    const result = await emailService.getUserPhone(request);
    return createResponse(200, result);
  }
};

