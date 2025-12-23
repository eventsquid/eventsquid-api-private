/**
 * Change Service
 * Migrated from Mantle ChangeService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import _ from 'lodash';

class ChangeService {
  /**
   * Get attendee data change activity
   */
  async getAttendeeChangeActivity(request) {
    try {
      const { attendeeID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!attendeeID) {
        throw new Error('Attendee ID is required');
      }

      const db = await getDatabase(null, vert);
      const activityCollection = db.collection('data-change-activity');

      // Get change activity for this attendee
      const changes = await activityCollection
        .find(
          { c: Number(attendeeID) },
          { 
            projection: { 
              _id: 0, 
              ts: 1, 
              col: 1, 
              lbl: 1, 
              acr: 1, 
              vbf: 1, 
              vaf: 1 
            } 
          }
        )
        .sort({ ts: 1 })
        .toArray();

      return changes;
    } catch (error) {
      console.error('Error getting attendee change activity:', error);
      throw error;
    }
  }

  /**
   * Get event change activity
   */
  async getEventChangeActivity(request) {
    try {
      const { eventID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!eventID) {
        throw new Error('Event ID is required');
      }

      const db = await getDatabase(null, vert);
      const activityCollection = db.collection('data-change-activity');

      // Get change activity for this event
      const changes = await activityCollection
        .find(
          { e: Number(eventID), utp: 'event' },
          { 
            projection: { 
              _id: 0, 
              ts: 1, 
              avy: 1, 
              fil: 1, 
              col: 1, 
              lbl: 1, 
              acr: 1, 
              vbf: 1, 
              vaf: 1 
            } 
          }
        )
        .sort({ ts: 1 })
        .toArray();

      return changes;
    } catch (error) {
      console.error('Error getting event change activity:', error);
      throw error;
    }
  }

  /**
   * Get affiliate change activity
   */
  async getAffiliateChangeActivity(request) {
    try {
      const { affiliateID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!affiliateID) {
        throw new Error('Affiliate ID is required');
      }

      const db = await getDatabase(null, vert);
      const activityCollection = db.collection('data-change-activity');

      // Get change activity for this affiliate
      const changes = await activityCollection
        .find(
          { a: Number(affiliateID), utp: 'affiliate' },
          { 
            projection: { 
              _id: 0, 
              ts: 1, 
              avy: 1, 
              fil: 1, 
              col: 1, 
              lbl: 1, 
              acr: 1, 
              vbf: 1, 
              vaf: 1, 
              act: 1, 
              path: 1 
            } 
          }
        )
        .sort({ ts: 1 })
        .toArray();

      return changes;
    } catch (error) {
      console.error('Error getting affiliate change activity:', error);
      throw error;
    }
  }

  /**
   * Create new change object
   */
  async newChangeObj(request) {
    return {
      e: Number(request.pathParameters?.eventID || 0),
      c: Number(request.pathParameters?.attendeeID || 0),
      u: Number(request.pathParameters?.userID || 0),
      acr: {
        u: Number(request.session?.user_id || 0),
        uf: _.trim(request.session?.user_firstname || ''),
        ul: _.trim(request.session?.user_lastname || ''),
        ue: _.trim(request.session?.user_email || ''),
        aul: Number(request.session?.user_admin_level || 0)
      },
      utp: '', // log item type: event (changes made event configuration) or attendee
      avy: '', // meals, reg item, etc
      act: '', // insert, update, delete
      path: request.path || '', // same as path in reg tracking
      fil: {}, // represents the query clause for finding the matching record
      src: '', // SQL table or Mongo Collection name
      col: '', // the database column modified by this change
      vaf: '--undefined--', // value after change
      vbf: '--undefined--', // value before change
      ts: new Date()
    };
  }

  /**
   * Purge non-changes from change array
   */
  async purgeNonChanges(changeRA) {
    // removes entries from a change array that are not actually a change in value
    return _.filter(changeRA, function(chg) {
      return _.trim(String(chg.vbf)) !== _.trim(String(chg.vaf));
    });
  }

  /**
   * Insert data change activity
   */
  async insertDataChangeActivity(activity, vert) {
    try {
      const db = await getDatabase(null, vert);
      const activityCollection = db.collection('data-change-activity');
      
      // If activity is an array, insert many; otherwise insert one
      if (Array.isArray(activity)) {
        if (activity.length > 0) {
          await activityCollection.insertMany(activity);
        }
      } else {
        await activityCollection.insertOne(activity);
      }
    } catch (error) {
      console.error('Error inserting data change activity:', error);
      throw error;
    }
  }
}

export default new ChangeService();

