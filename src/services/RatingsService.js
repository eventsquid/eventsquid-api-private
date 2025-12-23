/**
 * Ratings Service
 * Migrated from Mantle RatingsService.js
 */

import {
  getSessionBySlotID as getSessionBySlotIDFunc,
  saveSessionBySlotID as saveSessionBySlotIDFunc
} from '../functions/ratings.js';

class RatingsService {
  /**
   * Get session by slot ID
   */
  async getSessionBySlotID(request) {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const slotID = Number(request.pathParameters.slotID);
      const userID = Number(request.session?.user_id);
      const vert = request.vert;

      return await getSessionBySlotIDFunc(eventID, userID, slotID, vert);
    } catch (error) {
      console.error('Error getting session by slot ID:', error);
      throw error;
    }
  }

  /**
   * Save session by slot ID
   */
  async saveSessionBySlotID(request) {
    try {
      const eventID = Number(request.pathParameters.eventID);
      const slotID = Number(request.pathParameters.slotID);
      const userID = Number(request.session?.user_id);
      const vert = request.vert;
      const form = request.body || {};

      return await saveSessionBySlotIDFunc(eventID, userID, slotID, form, vert);
    } catch (error) {
      console.error('Error saving session by slot ID:', error);
      throw error;
    }
  }
}

export default new RatingsService();

