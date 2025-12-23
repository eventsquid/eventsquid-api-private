/**
 * Payment Service
 * Migrated from services/PaymentService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import {
  populateAffMerchant,
  getGateways,
  updateGateway,
  deleteGateway,
  resetPaymentProcessor
} from '../functions/affiliate.js';
import { getAvailableGateways } from '../functions/system.js';
import { sendUnconfirmedPaymentAlerts } from '../functions/paymentTransactions.js';

class PaymentService {
  /**
   * Send unconfirmed payment alerts
   */
  async sendUnconfirmedPaymentAlerts(request) {
    try {
      return await sendUnconfirmedPaymentAlerts(request);
    } catch (error) {
      console.error('Error sending unconfirmed payment alerts:', error);
      throw error;
    }
  }

  /**
   * Get affiliate gateways
   */
  async getAffiliateGateways(request) {
    try {
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;

      if (!affiliateID) {
        throw new Error('Affiliate ID required');
      }

      // Populate affiliate merchant if it doesn't exist
      await populateAffMerchant(affiliateID, vert);

      // Get gateways
      return await getGateways(affiliateID, vert);
    } catch (error) {
      console.error('Error getting affiliate gateways:', error);
      throw error;
    }
  }

  /**
   * Update gateway
   */
  async updateGateway(request) {
    try {
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const gatewayID = request.pathParameters?.gatewayID;
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;

      if (!affiliateID) {
        throw new Error('Affiliate ID required');
      }

      if (!gatewayID) {
        throw new Error('Gateway ID required');
      }

      // Populate affiliate merchant if it doesn't exist
      await populateAffMerchant(affiliateID, vert);

      // Update gateway
      return await updateGateway(affiliateID, gatewayID, request.body, vert);
    } catch (error) {
      console.error('Error updating gateway:', error);
      throw error;
    }
  }

  /**
   * Delete gateway
   */
  async deleteGateway(request) {
    try {
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const gatewayID = request.pathParameters?.gatewayID;
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;

      if (!affiliateID) {
        throw new Error('Affiliate ID required');
      }

      if (!gatewayID) {
        throw new Error('Gateway ID required');
      }

      // Populate affiliate merchant if it doesn't exist
      await populateAffMerchant(affiliateID, vert);

      // Delete gateway
      return await deleteGateway(affiliateID, gatewayID, vert);
    } catch (error) {
      console.error('Error deleting gateway:', error);
      throw error;
    }
  }

  /**
   * Get available gateways
   */
  async getAvailableGateways(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      return await getAvailableGateways(vert);
    } catch (error) {
      console.error('Error getting available gateways:', error);
      throw error;
    }
  }

  /**
   * Reset payment processor
   */
  async resetPaymentProcessor(request) {
    try {
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;

      if (!affiliateID) {
        throw new Error('Affiliate ID required');
      }

      return await resetPaymentProcessor(affiliateID, vert);
    } catch (error) {
      console.error('Error resetting payment processor:', error);
      throw error;
    }
  }
}

export default PaymentService;

