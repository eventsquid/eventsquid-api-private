/**
 * Stripe Service
 * Migrated from services/StripeService.js
 */

import { getDatabase } from '../utils/mongodb.js';

class StripeService {
  /**
   * Log Stripe payment webhook
   */
  async logPayment(request) {
    try {
      // Stripe logs are stored in "cm" vertical
      const db = await getDatabase(null, 'cm');
      const stripeLogs = db.collection('stripe-logs');

      const paymentObj = request.body || {};

      // If this has a reg type attached to it
      if (paymentObj.data?.object?.metadata?.regType) {
        // Add it to mongo as is
        await stripeLogs.insertOne(paymentObj);
      }

      return { status: 'success', message: 'Payment logged' };
    } catch (error) {
      console.error('Error logging Stripe payment:', error);
      throw error;
    }
  }
}

export default StripeService;

