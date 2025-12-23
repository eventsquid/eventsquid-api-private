/**
 * Authorize.net Service
 * Migrated from services/AuthNetService.js
 */

import {
  getMerchantDetails,
  getTransactionDetails,
  payByCreditCard,
  refundTransaction,
  checkMultiCheckout,
  getPaymentForm
} from '../functions/authNet.js';

class AuthNetService {
  /**
   * Get merchant details
   */
  async getMerchantDetails(request) {
    try {
      return await getMerchantDetails(request);
    } catch (error) {
      console.error('Error getting merchant details:', error);
      throw error;
    }
  }

  /**
   * Pay by credit card
   */
  async payByCreditCard(request) {
    try {
      return await payByCreditCard(request);
    } catch (error) {
      console.error('Error processing credit card payment:', error);
      throw error;
    }
  }

  /**
   * Refund transaction
   */
  async refundTransaction(request) {
    try {
      return await refundTransaction(request);
    } catch (error) {
      console.error('Error refunding transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransactionDetails(request) {
    try {
      return await getTransactionDetails(request);
    } catch (error) {
      console.error('Error getting transaction details:', error);
      throw error;
    }
  }

  /**
   * Check multi-checkout
   */
  async checkMultiCheckout(request) {
    try {
      return await checkMultiCheckout(request);
    } catch (error) {
      console.error('Error checking multi-checkout:', error);
      throw error;
    }
  }

  /**
   * Get payment form
   */
  async getPaymentForm(request) {
    try {
      return await getPaymentForm(request);
    } catch (error) {
      console.error('Error getting payment form:', error);
      throw error;
    }
  }
}

export default AuthNetService;

