/**
 * Payment routes
 * Migrated from payment-controller.js
 */

import { createResponse } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import PaymentService from '../services/PaymentService.js';

const paymentService = new PaymentService();

// Send unconfirmed payment alerts
export const sendUnconfirmedPaymentAlertsRoute = {
  method: 'POST',
  path: '/payment',
  handler: async (request) => {
    const result = await paymentService.sendUnconfirmedPaymentAlerts(request);
    return createResponse(200, result);
  }
};

// Get affiliate gateways
export const getAffiliateGatewaysRoute = {
  method: 'GET',
  path: '/payment/affiliate-gateways',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await paymentService.getAffiliateGateways(request);
    return createResponse(200, result);
  }))
};

// Update gateway
export const updateGatewayRoute = {
  method: 'POST',
  path: '/payment/affiliate-gateway/:gatewayID',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await paymentService.updateGateway(request);
    return createResponse(200, result);
  }))
};

// Delete gateway
export const deleteGatewayRoute = {
  method: 'DELETE',
  path: '/payment/affiliate-gateway/:gatewayID',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await paymentService.deleteGateway(request);
    return createResponse(200, result);
  }))
};

// Get available gateways
export const getAvailableGatewaysRoute = {
  method: 'GET',
  path: '/payment/available-gateways',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await paymentService.getAvailableGateways(request);
    return createResponse(200, result);
  }))
};

// Reset affiliate processor
export const resetPaymentProcessorRoute = {
  method: 'POST',
  path: '/payment/reset-affiliate-processor',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await paymentService.resetPaymentProcessor(request);
    return createResponse(200, result);
  }))
};

