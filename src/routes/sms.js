/**
 * SMS routes
 * Migrated from sms-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import SmsService from '../services/SmsService.js';

const smsService = new SmsService();

// Public endpoint - Twilio status callback
// Note: The original path uses ${process.env.TWILIO_STATUS_CALLBACK}
// This should be configured in API Gateway or handled via a catch-all route
// For now, using a standard path that can be configured
export const logTwilioStatusRoute = {
  method: 'POST',
  path: '/sms/twilio-status', // TODO: Configure actual Twilio callback path in API Gateway
  handler: async (request) => {
    const result = await smsService.logMessage(request);
    return createResponse(200, result);
  }
};

// Send SMS message
export const sendMessageRoute = {
  method: 'POST',
  path: '/sms/send',
  handler: async (request) => {
    await authenticate(request);
    const result = await smsService.sendMessage(request);
    return createResponse(200, result);
  }
};

// Get message by ID
export const findMessageRoute = {
  method: 'GET',
  path: '/sms/:id',
  handler: async (request) => {
    await authenticate(request);
    const result = await smsService.findMessageBody(request);
    return createResponse(200, result);
  }
};

// Send verification code
export const sendVerificationCodeRoute = {
  method: 'POST',
  path: '/sms/send-verify-code',
  handler: async (request) => {
    await authenticate(request);
    const result = await smsService.sendVerificationCode(request);
    return createResponse(200, result);
  }
};

