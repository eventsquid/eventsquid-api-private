/**
 * Authorize.net routes
 * Migrated from authNet-controller.js
 */

import { createResponse } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import AuthNetService from '../services/AuthNetService.js';
import { recordRefund } from '../functions/paymentTransactions/recordRefund.js';

const authNetService = new AuthNetService();

// Get public key by attendee
export const getPublicKeyByAttendeeRoute = {
  method: 'GET',
  path: '/authnet/publicKeyByAttendee/:attendeeID',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await authNetService.getMerchantDetails(request);
    return createResponse(200, result);
  }))
};

// Get public key by affiliate
export const getPublicKeyByAffiliateRoute = {
  method: 'GET',
  path: '/authnet/publicKeyByAffiliate/:affiliateID',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await authNetService.getMerchantDetails(request);
    return createResponse(200, result);
  }))
};

// Pay by credit card
export const payByCreditCardRoute = {
  method: 'POST',
  path: '/authnet/pay',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await authNetService.payByCreditCard(request);
    return createResponse(200, result);
  }))
};

// Refund transaction
export const refundTransactionRoute = {
  method: 'DELETE',
  path: '/authnet/refund/:contestantID/:affiliateID/:transactionID/:refundAmount',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await authNetService.refundTransaction(request);
    return createResponse(200, result);
  }))
};

// Get transaction details
export const getTransactionDetailsRoute = {
  method: 'GET',
  path: '/authnet/transactionDetails/:affiliateID/:transactionID',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await authNetService.getTransactionDetails(request);
    return createResponse(200, result);
  }))
};

// Test - Record refund
export const testRecordRefundRoute = {
  method: 'POST',
  path: '/authnet/test/recordRefund',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await recordRefund(request);
    return createResponse(200, result);
  }))
};

// Check multi-checkout
export const checkMultiCheckoutRoute = {
  method: 'GET',
  path: '/authnet/checkMultiCheckout/:contestantID',
  handler: requireAuth(requireVertical(async (request) => {
    const result = request.session?.multicheckout 
      ? { multiCheckout: true, contestants: request.session.multicheckout }
      : await authNetService.checkMultiCheckout(request);
    return createResponse(200, result);
  }))
};

// Get payment form
export const getPaymentFormRoute = {
  method: 'GET',
  path: '/authnet/getPaymentForm/:login/:key/:payAmount/:contestantID/:affiliateID',
  handler: requireAuth(requireVertical(async (request) => {
    const result = await authNetService.getPaymentForm(request);
    return createResponse(200, result);
  }))
};

