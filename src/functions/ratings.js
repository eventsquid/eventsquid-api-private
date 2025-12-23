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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Get speaker ratings
    const speakersRA = await connection.sql(`
      USE ${dbName};
      EXEC [dbo].[node_getSpeakerRatingsByEventID-userID-SlotID] @eventID, @userID, @slotID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('userID', TYPES.Int, Number(userID))
    .parameter('slotID', TYPES.Int, Number(slotID))
    .execute();

    // Get session ratings
    const sessionRA = await connection.sql(`
      USE ${dbName};
      EXEC [dbo].[node_getSessionRatingsByEventID-userID-SlotID] @eventID, @userID, @slotID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('userID', TYPES.Int, Number(userID))
    .parameter('slotID', TYPES.Int, Number(slotID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Save session ratings
    const sessionSave = await connection.sql(`
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
    `)
    .parameter('overallrating', TYPES.Float, Number(form.overall))
    .parameter('contentrating', TYPES.Float, Number(form.content))
    .parameter('materialsrating', TYPES.Float, Number(form.materials))
    .parameter('haveagainrating', TYPES.Float, Number(form.haveagain))
    .parameter('experiencerating', TYPES.Float, Number(form.experience))
    .parameter('deliveryrating', TYPES.Float, Number(form.delivery))
    .parameter('comments', TYPES.VarChar, _.trim(form.comments))
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('userID', TYPES.Int, Number(userID))
    .parameter('eventFeeID', TYPES.Int, Number(form.eventFeeID))
    .parameter('slotID', TYPES.Int, Number(slotID))
    .parameter('source', TYPES.VarChar, _.trim(form.source))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const result = await connection.sql(`
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
    `)
    .parameter('overallrating', TYPES.Float, Number(form.overall))
    .parameter('contentrating', TYPES.Float, Number(form.content))
    .parameter('materialsrating', TYPES.Float, Number(form.materials))
    .parameter('haveagainrating', TYPES.Float, Number(form.haveagain))
    .parameter('experiencerating', TYPES.Float, Number(form.experience))
    .parameter('deliveryrating', TYPES.Float, Number(form.delivery))
    .parameter('comments', TYPES.VarChar, _.trim(form.comments))
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('userID', TYPES.Int, Number(userID))
    .parameter('speakerID', TYPES.Int, Number(form.speakerID))
    .parameter('source', TYPES.VarChar, _.trim(form.source))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const ratingConfigRA = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_getRatingsConfigByEventID @eventID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

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

