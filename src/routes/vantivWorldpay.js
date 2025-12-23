/**
 * Vantiv/Worldpay routes
 * Migrated from vantiv-worldpay-controller.js
 */

import { createResponse } from '../utils/response.js';
import VantivWorldpayService from '../services/VantivWorldpayService.js';

const vantivWorldpayService = new VantivWorldpayService();

// Setup transaction
export const transactionSetupRoute = {
  method: 'POST',
  path: '/vantiv-worldpay/transactionSetup',
  handler: async (request) => {
    try {
      const result = await vantivWorldpayService.transactionSetup(request);
      return createResponse(200, result);
    } catch (error) {
      return createResponse(500, {
        status: 'fail',
        message: error.message
      });
    }
  }
};

// Refund transaction
export const refundTransactionRoute = {
  method: 'DELETE',
  path: '/vantiv-worldpay/refund/:contestantID/:affiliateID/:transactionID/:refundAmount',
  handler: async (request) => {
    const result = await vantivWorldpayService.creditCardReturn(request);
    return createResponse(200, result);
  }
};

