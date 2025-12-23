/**
 * Stripe routes
 * Migrated from stripe-controller.js
 */

import { createResponse } from '../utils/response.js';
import StripeService from '../services/StripeService.js';

const stripeService = new StripeService();

// Public endpoint - Stripe webhook
export const logStripePaymentRoute = {
  method: 'POST',
  path: '/stripe',
  handler: async (request) => {
    const result = await stripeService.logPayment(request);
    return createResponse(200, result);
  }
};

