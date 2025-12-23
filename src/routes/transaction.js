/**
 * Transaction routes
 * Migrated from transaction-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate, checkSession } from '../middleware/auth.js';
import TransactionService from '../services/TransactionService.js';
import { findByGatewayAndContestantID } from '../functions/paymentTransactions/findByGatewayAndContestantID.js';

const transactionService = new TransactionService();

// Find transaction by gateway and transaction ID
export const findTransactionByGatewayRoute = {
  method: 'GET',
  path: '/transaction/:gateway/:transactionID',
  handler: async (request) => {
    await checkSession(request);
    const result = await transactionService.findByGatewayAndID(request);
    return createResponse(200, result);
  }
};

// Find transactions by gateway and contestant ID
export const findTransactionsByContestantRoute = {
  method: 'GET',
  path: '/transaction/contestant/:gateway/:contestantID',
  handler: async (request) => {
    await checkSession(request);
    const { gateway, contestantID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await findByGatewayAndContestantID(gateway, contestantID, vert);
    return createResponse(200, result);
  }
};

