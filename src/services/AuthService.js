/**
 * Authentication Service
 * Handles session validation and dev token validation
 * Migrated from Mantle AuthService
 */

import { getDatabase } from '../utils/mongodb.js';
import { ObjectId } from 'mongodb';

class AuthService {
  /**
   * Get session data by token
   * @param {string} token - Session token (cfid_cftoken)
   * @returns {Promise<Object|null>} Session data or null
   */
  async getSession(token) {
    try {
      // Use 'cm' database for common/session data
      // TODO: Update to use correct database connection based on vertical
      const db = await getDatabase('cm'); // cm = eventsquid-common
      const sessions = db.collection('cfsessions');
      const session = await sessions.findOne({ _id: token });
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Validate dev token
   * @param {string} devToken - Development token
   * @returns {Promise<boolean>} True if valid
   */
  async validateDevToken(devToken) {
    try {
      const db = await getDatabase('cm'); // cm = eventsquid-common
      const devTokens = db.collection('dev-keys');
      
      // Try to parse as ObjectId, fallback to string
      let query;
      try {
        query = { _id: new ObjectId(devToken) };
      } catch (e) {
        query = { _id: devToken };
      }
      
      const token = await devTokens.findOne(query);
      return !!token;
    } catch (error) {
      console.error('Error validating dev token:', error);
      return false;
    }
  }
}

export default new AuthService();

