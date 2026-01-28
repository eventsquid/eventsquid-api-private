/**
 * Payment routes
 * Migrated from payment-controller.js
 */

import { createResponse, errorResponse } from '../utils/response.js';
import { authenticate, verticalCheck } from '../middleware/auth.js';
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
  handler: async (request) => {
    try {
      await authenticate(request);
      await verticalCheck(request);
      const result = await paymentService.getAffiliateGateways(request);
      return createResponse(200, result);
    } catch (error) {
      if (error.message === 'Invalid Session' || error.message === 'Invalid Dev Token' || error.message === 'Could not construct session identifier') {
        return errorResponse(error.message, 401);
      }
      throw error;
    }
  }
};

// Update gateway
export const updateGatewayRoute = {
  method: 'POST',
  path: '/payment/affiliate-gateway/:gatewayID',
  handler: async (request) => {
    try {
      await authenticate(request);
      await verticalCheck(request);
      const result = await paymentService.updateGateway(request);
      return createResponse(200, result);
    } catch (error) {
      if (error.message === 'Invalid Session' || error.message === 'Invalid Dev Token' || error.message === 'Could not construct session identifier') {
        return errorResponse(error.message, 401);
      }
      throw error;
    }
  }
};

// Delete gateway
export const deleteGatewayRoute = {
  method: 'DELETE',
  path: '/payment/affiliate-gateway/:gatewayID',
  handler: async (request) => {
    try {
      await authenticate(request);
      await verticalCheck(request);
      const result = await paymentService.deleteGateway(request);
      return createResponse(200, result);
    } catch (error) {
      if (error.message === 'Invalid Session' || error.message === 'Invalid Dev Token' || error.message === 'Could not construct session identifier') {
        return errorResponse(error.message, 401);
      }
      throw error;
    }
  }
};

// Get available gateways
export const getAvailableGatewaysRoute = {
  method: 'GET',
  path: '/payment/available-gateways',
  handler: async (request) => {
    try {
      await authenticate(request);
      await verticalCheck(request);
      const result = await paymentService.getAvailableGateways(request);
      return createResponse(200, result);
    } catch (error) {
      if (error.message === 'Invalid Session' || error.message === 'Invalid Dev Token' || error.message === 'Could not construct session identifier') {
        return errorResponse(error.message, 401);
      }
      throw error;
    }
  }
};

// Reset affiliate processor
export const resetPaymentProcessorRoute = {
  method: 'POST',
  path: '/payment/reset-affiliate-processor',
  handler: async (request) => {
    try {
      await authenticate(request);
      await verticalCheck(request);
      const result = await paymentService.resetPaymentProcessor(request);
      return createResponse(200, result);
    } catch (error) {
      if (error.message === 'Invalid Session' || error.message === 'Invalid Dev Token' || error.message === 'Could not construct session identifier') {
        return errorResponse(error.message, 401);
      }
      throw error;
    }
  }
};

