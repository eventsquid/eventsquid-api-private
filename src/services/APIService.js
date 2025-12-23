/**
 * API Service
 * Migrated from Mantle APIService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { v4 as uuidv4 } from 'uuid';

class APIService {
  /**
   * Generate API key
   * Format: esk_{32 chars}_key_v2
   */
  generateAPIKey() {
    const uuid1 = uuidv4().replace(/-/g, '').toLowerCase();
    const uuid2 = uuidv4().replace(/-/g, '').toLowerCase();
    const combined = (uuid1 + uuid2).substring(0, 32);
    return `esk_${combined}_key_v2`;
  }

  /**
   * Save API permissions
   */
  async savePermissions(request, record) {
    try {
      const { userID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      const session = request.session || {};
      
      if (!userID || !vert) {
        throw new Error('User ID and vertical are required');
      }

      let newKey = false;
      
      // If this is a new key, generate one
      if (!record.k || record.k === '') {
        newKey = true;
        record.k = this.generateAPIKey();
      }

      const db = await getDatabase(null, vert);
      const publicApiKeysCollection = db.collection('public-api-keys');

      // Upsert the API key record
      const result = await publicApiKeysCollection.updateOne(
        {
          u: Number(userID),
          a: Number(session.affiliate_id)
        },
        {
          $set: {
            v: Number(record.v || 0),
            a: Number(session.affiliate_id),
            u: Number(record.u || userID),
            p: record.p || []
          },
          $setOnInsert: {
            _id: {
              s: vert,
              a: Number(session.affiliate_id),
              u: Number(record.u || userID)
            },
            k: record.k
          }
        },
        { upsert: true }
      );

      if (newKey) {
        return {
          userID: Number(record.u || userID),
          apiKey: record.k,
          accessAdded: true
        };
      } else {
        return {
          userID: Number(record.u || userID),
          modifyAccess: true
        };
      }
    } catch (error) {
      console.error('Error saving API permissions:', error);
      throw error;
    }
  }

  /**
   * Delete API permissions
   */
  async deletePermissions(request) {
    try {
      const { userID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      const session = request.session || {};
      
      if (!userID || !vert) {
        throw new Error('User ID and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const publicApiKeysCollection = db.collection('public-api-keys');

      const result = await publicApiKeysCollection.deleteOne({
        u: Number(userID),
        a: Number(session.affiliate_id)
      });

      return {
        userID: Number(userID),
        removeAccess: result.deletedCount > 0
      };
    } catch (error) {
      console.error('Error deleting API permissions:', error);
      throw error;
    }
  }
}

export default new APIService();

