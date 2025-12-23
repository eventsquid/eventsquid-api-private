/**
 * Verification Service
 * Migrated from Mantle VerificationService.js
 */

import { getDatabase } from '../utils/mongodb.js';

class VerificationService {
  /**
   * Verify code
   * Checks if the provided email and code match a record in auto-login-tokens collection
   */
  async verifyCode(request) {
    try {
      const { email, code } = request.body || {};
      
      if (!email || !code) {
        return { verified: false, error: 'Email and code are required' };
      }

      // Verification tokens are stored in the 'cm' (connect) vertical database
      const db = await getDatabase(null, 'cm');
      const loginTokensCollection = db.collection('auto-login-tokens');

      // Find matching token
      const token = await loginTokensCollection.findOne({
        email: email,
        code: Number(code)
      });

      if (token) {
        return { verified: true, token: token };
      } else {
        return { verified: false };
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      return { verified: false, error: error.message };
    }
  }
}

export default new VerificationService();

