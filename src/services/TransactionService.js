/**
 * Transaction Service
 * Migrated from services/TransactionService.js
 */

import { findByGatewayAndID as findByGatewayAndIDFunc } from '../functions/paymentTransactions.js';

class TransactionService {
  /**
   * Find transaction by gateway and transaction ID
   */
  async findByGatewayAndID(request) {
    try {
      return await findByGatewayAndIDFunc(request);
    } catch (error) {
      console.error('Error finding transaction by gateway and ID:', error);
      throw error;
    }
  }
}

export default TransactionService;

