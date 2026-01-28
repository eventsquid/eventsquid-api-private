/**
 * Root routes migrated from Mantle root-controller.js
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse, createResponse } from '../utils/response.js';
import { utcToTimezone, timezoneToUTC } from '../functions/conversions.js';
import RootService from '../services/RootService.js';

const _rootService = new RootService();

/**
 * POST /utcToEventZone
 * Convert UTC date to event timezone
 */
export const utcToEventZoneRoute = {
  method: 'POST',
  path: '/utcToEventZone',
  handler: requireAuth(async (request) => {
    try {
      const { date, zone, format } = request.body || {};
      
      if (!date || !zone) {
        return errorResponse('date and zone are required', 400);
      }
      
      const convertedDate = utcToTimezone(new Date(date), zone, format || 'YYYY-MM-DD HH:mm:ss');
      
      return createResponse(200, { date: convertedDate });
    } catch (error) {
      console.error('Error in utcToEventZone:', error);
      return errorResponse('Failed to convert timezone', 500, error.message);
    }
  })
};

/**
 * POST /timezoneToUTC
 * Convert timezone date to UTC
 */
export const timezoneToUTCRoute = {
  method: 'POST',
  path: '/timezoneToUTC',
  handler: requireAuth(async (request) => {
    try {
      const { date, zone, format } = request.body || {};
      
      if (!date || !zone) {
        return errorResponse('date and zone are required', 400);
      }
      
      const utcDate = timezoneToUTC(new Date(date), zone, format || 'YYYY-MM-DD HH:mm:ss');
      
      return createResponse(200, { date: utcDate });
    } catch (error) {
      console.error('Error in timezoneToUTC:', error);
      return errorResponse('Failed to convert to UTC', 500, error.message);
    }
  })
};

/**
 * GET /jurisdictions
 * Get jurisdictions list
 */
export const jurisdictionsRoute = {
  method: 'GET',
  path: '/jurisdictions',
  handler: requireAuth(async (request) => {
    try {
      const jurisdictions = await _rootService.getJurisdictions();
      
      return createResponse(200, jurisdictions);
    } catch (error) {
      console.error('Error getting jurisdictions:', error);
      return errorResponse('Failed to get jurisdictions', 500, error.message);
    }
  })
};

/**
 * POST /images/:vert
 * Save an image to S3 and update MSSQL/MongoDB
 */
export const postImagesRoute = {
  method: 'POST',
  path: '/images/:vert',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const vert = request.pathParameters?.vert;
      const body = request.body || {};
      const session = request.session || request.user || {};
      
      // Validate required fields
      if (!body.base64 || !body.type || !body.fileName || !body._guid) {
        return errorResponse('Missing required fields: base64, type, fileName, _guid', 400);
      }

      // File type mapping
      const fileTypes = {
        jpg: { ext: 'jpg', type: 'image/jpeg' },
        png: { ext: 'png', type: 'image/png' }
      };

      const fileType = fileTypes[body.type];
      if (!fileType) {
        return errorResponse('Invalid file type. Must be jpg or png', 400);
      }

      // Create buffer from base64
      const base64Data = body.base64.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(base64Data, 'base64');

      // Construct filename
      const fileName = `${body._guid}/${body.fileName}.${fileType.ext}`;
      const S3_BASE_URL = process.env.S3_BASE_URL || 'https://s3-us-west-2.amazonaws.com/eventsquid/';
      const logoURL = S3_BASE_URL + fileName;

      // Upload to S3
      const { uploadS3 } = await import('../utils/s3.js');
      await uploadS3(buf, '', fileType.ext, fileType.type, fileName);

      // Update database based on file type
      const { getConnection, getDatabaseName, TYPES } = await import('../utils/mssql.js');
      const { getDatabase } = await import('../utils/mongodb.js');
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);

      // Handle different file types
      if (body.fileName === 'org-logo') {
        // Update affiliate record
        const request = new sql.Request();
        request.input('logoURL', sql.VarChar, logoURL);
        request.input('guid', sql.UniqueIdentifier, body._guid);
        const result = await request.query(`
          USE ${dbName};
          UPDATE b_affiliates
          SET logo = @logoURL, logos3 = @logoURL
          WHERE _guid = @guid;
          SELECT affiliate_id FROM b_affiliates WHERE _guid = @guid;
        `);
        const results = result.recordset;

        if (results.length) {
          const eventsColl = db.collection('events');
          await eventsColl.updateMany(
            { '_id.a': Number(results[0].affiliate_id) },
            { $set: { al3: logoURL } }
          );
        }
      } else if (body.fileName === 'speaker-photo') {
        // Update speaker record
        const request = new sql.Request();
        request.input('photoURL', sql.VarChar, logoURL);
        request.input('guid', sql.UniqueIdentifier, body._guid);
        await request.query(`
          USE ${dbName};
          UPDATE b_speakers
          SET speaker_PhotoS3 = @photoURL
          WHERE _guid = @guid
        `);
      } else if (body.fileName === 'avatars') {
        // Validate user can only update their own avatar
        const userID = Number(body.userID);
        const sessionUserID = Number(session.user_id);
        const actualUserID = Number(session.actualuser_id);
        
        if (userID !== sessionUserID && userID !== actualUserID) {
          return errorResponse('Unauthorized: Cannot update avatar for another user', 403);
        }

        // Update user record
        const request = new sql.Request();
        request.input('avatarURL', sql.VarChar, logoURL);
        request.input('userID', sql.Int, userID);
        await request.query(`
          USE ${dbName};
          UPDATE b_users
          SET avatar = @avatarURL, avatars3 = @avatarURL
          WHERE user_id = @userID
        `);
      } else {
        return errorResponse('Invalid fileName. Must be org-logo, speaker-photo, or avatars', 400);
      }

      return createResponse(200, { url: logoURL });
    } catch (error) {
      console.error('Error saving image:', error);
      return errorResponse('Failed to save image', 500, error.message);
    }
  }))
};

