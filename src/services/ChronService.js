/**
 * Chron Service (Cron jobs)
 * Migrated from Mantle ChronService.js
 */

import { getPending, updatePending } from '../functions/paymentTransactions.js';

class ChronService {
  /**
   * Get pending transactions
   */
  async getPendingTransactions(request) {
    try {
      const affiliateID = request.pathParameters?.affiliateID || 0;
      const vert = request.headers?.vert || request.vert;
      
      return await getPending(affiliateID, vert);
    } catch (error) {
      console.error('Error getting pending transactions:', error);
      throw error;
    }
  }

  /**
   * Update pending transactions
   */
  async updatePendingTransactions(request) {
    try {
      const affiliateID = request.body?.affiliateID || 0;
      const vert = request.body?.vert || request.headers?.vert || request.vert;
      const validationkey = request.body?.validationkey;
      
      return await updatePending(affiliateID, vert, validationkey);
    } catch (error) {
      console.error('Error updating pending transactions:', error);
      throw error;
    }
  }
}

export default new ChronService();

