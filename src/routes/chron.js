/**
 * Chron (Cron) routes migrated from Mantle chron-controller.js
 * These are typically called by scheduled tasks/cron jobs
 */

import { successResponse, errorResponse } from '../utils/response.js';
import ChronService from '../services/ChronService.js';

const _chronService = new ChronService();

/**
 * GET /chron/pending-transactions
 * Get pending transactions (cron endpoint)
 */
export const getPendingTransactionsRoute = {
  method: 'GET',
  path: '/chron/pending-transactions',
  handler: async (request) => {
    try {
      const result = await _chronService.getPendingTransactions(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting pending transactions:', error);
      return errorResponse('Failed to get pending transactions', 500, error.message);
    }
  }
};

/**
 * GET /chron/pending-transactions/:affiliateID
 * Get pending transactions by affiliate (cron endpoint)
 */
export const getPendingTransactionsByAffiliateRoute = {
  method: 'GET',
  path: '/chron/pending-transactions/:affiliateID',
  handler: async (request) => {
    try {
      const result = await _chronService.getPendingTransactions(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error getting pending transactions by affiliate:', error);
      return errorResponse('Failed to get pending transactions', 500, error.message);
    }
  }
};

/**
 * POST /chron/pending-transactions
 * Update pending transactions (cron endpoint)
 */
export const updatePendingTransactionsRoute = {
  method: 'POST',
  path: '/chron/pending-transactions',
  handler: async (request) => {
    try {
      const result = await _chronService.updatePendingTransactions(request);
      return successResponse(result);
    } catch (error) {
      console.error('Error updating pending transactions:', error);
      return errorResponse('Failed to update pending transactions', 500, error.message);
    }
  }
};

