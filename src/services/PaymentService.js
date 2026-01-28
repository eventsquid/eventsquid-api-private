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

/**
 * Get header value case-insensitively
 */
function getHeader(headers, name) {
  if (!headers) return undefined;
  // Try exact match first
  if (headers[name]) return headers[name];
  // Try case-insensitive match
  const lowerName = name.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === lowerName) {
      return headers[key];
    }
  }
  return undefined;
}

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
   * Matches old behavior: directly accesses request.session.affiliate_id
   */
  async getAffiliateGateways(request) {
    try {
      // Match old code: directly access session.affiliate_id (old code: req.session.affiliate_id)
      const affiliateID = request.session?.affiliate_id;
      const vert = getHeader(request.headers, 'vert') || request.pathParameters?.vert;

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
   * Matches old behavior: directly accesses request.session.affiliate_id
   */
  async updateGateway(request) {
    try {
      // Match old code: directly access session.affiliate_id (old code: req.session.affiliate_id)
      const affiliateID = request.session?.affiliate_id;
      const gatewayID = request.pathParameters?.gatewayID;
      const vert = getHeader(request.headers, 'vert') || request.pathParameters?.vert;

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
   * Matches old behavior: directly accesses request.session.affiliate_id
   */
  async deleteGateway(request) {
    try {
      // Match old code: directly access session.affiliate_id (old code: req.session.affiliate_id)
      const affiliateID = request.session?.affiliate_id;
      const gatewayID = request.pathParameters?.gatewayID;
      const vert = getHeader(request.headers, 'vert') || request.pathParameters?.vert;

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
      const vert = getHeader(request.headers, 'vert') || request.pathParameters?.vert;
      return await getAvailableGateways(vert);
    } catch (error) {
      console.error('Error getting available gateways:', error);
      throw error;
    }
  }

  /**
   * Reset payment processor
   * Matches old behavior: directly accesses request.session.affiliate_id
   */
  async resetPaymentProcessor(request) {
    try {
      // Match old code: directly access session.affiliate_id (old code: req.session.affiliate_id)
      const affiliateID = request.session?.affiliate_id;
      const vert = getHeader(request.headers, 'vert') || request.pathParameters?.vert;

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

