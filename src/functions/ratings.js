/**
 * Ratings functions
 * Migrated from Mantle functions/ratings
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _ from 'lodash';

/**
 * Get session by slot ID
 */
export async function getSessionBySlotID(eventID, userID, slotID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Get speaker ratings
    const request1 = new sql.Request();
    request1.input('eventID', sql.Int, Number(eventID));
    request1.input('userID', sql.Int, Number(userID));
    request1.input('slotID', sql.Int, Number(slotID));
    const result1 = await request1.query(`
      USE ${dbName};
      EXEC [dbo].[node_getSpeakerRatingsByEventID-userID-SlotID] @eventID, @userID, @slotID
    `);
    const speakersRA = result1.recordset;

    // Get session ratings
    const request2 = new sql.Request();
    request2.input('eventID', sql.Int, Number(eventID));
    request2.input('userID', sql.Int, Number(userID));
    request2.input('slotID', sql.Int, Number(slotID));
    const result2 = await request2.query(`
      USE ${dbName};
      EXEC [dbo].[node_getSessionRatingsByEventID-userID-SlotID] @eventID, @userID, @slotID
    `);
    const sessionRA = result2.recordset;

    const sessionObj = sessionRA[0] || {};

    // If we have a session object, add speakers
    if (sessionRA.length > 0) {
      sessionObj.speakers = speakersRA;
    }

    // Get ratings config
    const ratingConfigObj = await getRatingsConfigByEventID(eventID, vert);

    return {
      ratings: sessionObj,
      ratingConfigObj
    };
  } catch (error) {
    console.error('Error getting session by slot ID:', error);
    throw error;
  }
}

/**
 * Save session by slot ID
 */
export async function saveSessionBySlotID(eventID, userID, slotID, form, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Save session ratings
    const request = new sql.Request();
    request.input('overallrating', sql.Float, Number(form.overall));
    request.input('contentrating', sql.Float, Number(form.content));
    request.input('materialsrating', sql.Float, Number(form.materials));
    request.input('haveagainrating', sql.Float, Number(form.haveagain));
    request.input('experiencerating', sql.Float, Number(form.experience));
    request.input('deliveryrating', sql.Float, Number(form.delivery));
    request.input('comments', sql.VarChar, _.trim(form.comments));
    request.input('eventID', sql.Int, Number(eventID));
    request.input('userID', sql.Int, Number(userID));
    request.input('eventFeeID', sql.Int, Number(form.eventFeeID));
    request.input('slotID', sql.Int, Number(slotID));
    request.input('source', sql.VarChar, _.trim(form.source));
    const result = await request.query(`
      USE ${dbName};
      EXEC [dbo].[node_saveSessionRatingsBySlotID-eventID-userID-eventFeeID]
          @eventID,
          @userID,
          @eventFeeID,
          @slotID,
          @overallrating,
          @contentrating,
          @materialsrating,
          @haveagainrating,
          @experiencerating,
          @deliveryrating,
          @comments,
          @source
    `);
    const sessionSave = result.recordset;

    const saveRA = [sessionSave];

    // If we have speakers to save
    if (form.speakers && form.speakers.length > 0) {
      // Loop the speakers and rate each one
      for (let i = 0; i < form.speakers.length; i++) {
        saveRA.push(await saveSpeaker(eventID, userID, form.speakers[i], vert));
      }
    }

    return saveRA;
  } catch (error) {
    console.error('Error saving session by slot ID:', error);
    throw error;
  }
}

/**
 * Save speaker ratings
 */
export async function saveSpeaker(eventID, userID, form, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('overallrating', sql.Float, Number(form.overall));
    request.input('contentrating', sql.Float, Number(form.content));
    request.input('materialsrating', sql.Float, Number(form.materials));
    request.input('haveagainrating', sql.Float, Number(form.haveagain));
    request.input('experiencerating', sql.Float, Number(form.experience));
    request.input('deliveryrating', sql.Float, Number(form.delivery));
    request.input('comments', sql.VarChar, _.trim(form.comments));
    request.input('eventID', sql.Int, Number(eventID));
    request.input('userID', sql.Int, Number(userID));
    request.input('speakerID', sql.Int, Number(form.speakerID));
    request.input('source', sql.VarChar, _.trim(form.source));
    const result = await request.query(`
      USE ${dbName};
      EXEC [dbo].[node_saveSpeakerRatingsBySpeakerID-eventID-userID]
          @eventID,
          @userID,
          @speakerID,
          @overallrating,
          @contentrating,
          @materialsrating,
          @haveagainrating,
          @experiencerating,
          @deliveryrating,
          @comments,
          @source
    `);

    return result;
  } catch (error) {
    console.error('Error saving speaker ratings:', error);
    throw error;
  }
}

/**
 * Get ratings config by event ID
 */
export async function getRatingsConfigByEventID(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getRatingsConfigByEventID @eventID
    `);
    const ratingConfigRA = result.recordset;

    const defaultConfig = {
      showcomments: true,
      showoverall: true,
      showcontent: true,
      showmaterials: true,
      showhaveagain: true,
      showexperience: true,
      showdelivery: true,
      overalllabel: 'Overall',
      contentlabel: 'Content',
      materialslabel: 'Materials',
      deliverylabel: 'Delivery',
      haveagainlabel: 'Have again?'
    };

    const ratingConfigObj = {
      session: _.assign({}, defaultConfig),
      speaker: _.assign({}, defaultConfig)
    };

    // Layer the rating configuration over the defaults
    for (let i = 0; i < ratingConfigRA.length; i++) {
      // Remove any null value
      const configItem = _.omitBy(ratingConfigRA[i], _.isNull);

      // If this is a session rating config
      if (configItem.sessionrating) {
        ratingConfigObj.session = _.assign(ratingConfigObj.session, configItem);
      } else {
        ratingConfigObj.speaker = _.assign(ratingConfigObj.speaker, configItem);
      }
    }

    return ratingConfigObj;
  } catch (error) {
    console.error('Error getting ratings config by event ID:', error);
    throw error;
  }
}

/**
 * Get all rating configs by event and user
 * Uses stored procedure node_getAllRatingConfigsByEventAndUser
 */
export async function getAllRatingConfigsByEventAndUser(userID, eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('userID', sql.Int, Number(userID));
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getAllRatingConfigsByEventAndUser @userID, @eventID
    `);
    const results = result.recordset;

    return results.map(result => {
      if (!result.reviews_on && result.reviewable_speakers > 0) {
        // Enable reviewing
        result.reviews_on = true;
      }
      delete result.reviewable_speakers;
      return result;
    });
  } catch (error) {
    console.error('Error getting all rating configs by event and user:', error);
    throw error;
  }
}

