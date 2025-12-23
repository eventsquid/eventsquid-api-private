/**
 * Activity Service
 * Migrated from Mantle ActivityService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import _ from 'lodash';

class ActivityService {
  /**
   * Get attendee registration activity
   */
  async getAttendeeRegActivity(request) {
    try {
      const { attendeeID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!attendeeID) {
        throw new Error('Attendee ID is required');
      }

      const db = await getDatabase(null, vert);
      const activityCollection = db.collection('site-activity-logs');

      // Get activity logs for this attendee
      const activities = await activityCollection
        .find(
          { c: Number(attendeeID) },
          { 
            projection: { 
              _id: 0, 
              ts: 1, 
              desc: 1, 
              acr: 1, 
              ssc: 1, 
              chg: 1, 
              tgt: 1 
            } 
          }
        )
        .sort({ ts: 1 })
        .toArray();

      return activities;
    } catch (error) {
      console.error('Error getting attendee registration activity:', error);
      throw error;
    }
  }

  /**
   * Create new activity object
   */
  async newActivityObj(request) {
    return {
      c: [], // array of any collected contestant_id(s) on this request
      u: [Number(request.session?.user_id || 0)], // array of any collected user_id(s) on this request
      e: 0,
      ts: new Date(), // auto-expiring index on this field
      _d: false, // flagged as diagnostic entry
      _e: false, // flagged as containing error report
      _s: false, // flagged as containing session changes
      _aj: false, // flagged as an ajax call
      _st: 'new', // which stack is this from? (legacy, new)
      _sv: '', // server ID
      acr: {
        u: Number(request.session?.user_id || 0),
        uf: _.trim(request.session?.user_firstname || ''),
        ul: _.trim(request.session?.user_lastname || ''),
        ue: _.trim(request.session?.user_email || ''),
        aul: Number(request.session?.user_admin_level || 0)
      },
      tgt: {},
      ip: request.session?._realip || '',
      m: request.httpMethod || 'POST',
      ua: request.headers?.['user-agent'] || '',
      path: request.path || '',
      desc: [],
      fm: request.body || {},
      url: _.assign({}, request.pathParameters || {}, request.queryStringParameters || {}),
      err: {},
      ssc: [],
      ss: {},
      lcl: [],
      chg: []
    };
  }

  /**
   * Insert attendee registration activity
   */
  async insertAttendeeRegActivity(activity, vert) {
    try {
      const db = await getDatabase(null, vert);
      const activityCollection = db.collection('site-activity-logs');
      await activityCollection.insertOne(activity);
    } catch (error) {
      console.error('Error inserting attendee registration activity:', error);
      throw error;
    }
  }
}

export default new ActivityService();

