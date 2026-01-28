/**
 * Import Service
 * Migrated from Mantle ImportService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _ from 'lodash';
import _activityService from './ActivityService.js';
import _changeService from './ChangeService.js';
import _attendeeService from './AttendeeService.js';

class ImportService {
  /**
   * Import travel fields
   * Imports attendee travel data from roster and updates MSSQL and MongoDB
   */
  async importTravelFields(request) {
    try {
      const vert = request.headers?.vert || request.vert;
      const eventID = Number(request.pathParameters?.eventID);
      const profileID = Number(request.pathParameters?.profileID);
      const affiliateID = Number(request.session?.affiliate_id);
      const roster = request.body?.roster || [];
      const isTravel = request.body?.travel || false;

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);

      // Create activity and change objects
      const activityObj = await _activityService.newActivityObj(request);
      const changeObj = await _changeService.newChangeObj(request);

      // Update activity object
      activityObj.desc.push(_.trim(`Attendee Data Import ${isTravel ? '(Travel)' : ''}`));
      activityObj.e = eventID;

      // Get custom travel fields
      const request = new sql.Request();
      request.input('affiliateID', sql.Int, affiliateID);
      const result = await request.query(`
        USE ${dbName};
        SELECT fieldLabel, field_id, fieldExportID, fieldinput
        FROM custom_fields
        WHERE ( affiliate_id = @affiliateID OR ISNULL( affiliate_id, 0 ) = 0 )
          AND travelfield = 1
      `);
      const customFieldsRA = result.recordset;

      // Build custom fields object
      const customFieldsObj = {};
      for (let i = 0; i < customFieldsRA.length; i++) {
        const fldKey = String(_.trim(customFieldsRA[i].fieldLabel)).replace(/\s/g, '_');
        customFieldsObj[fldKey.toLowerCase()] = {
          fieldID: Number(customFieldsRA[i].field_id),
          prompt: _.trim(customFieldsRA[i].fieldLabel),
          export: _.trim(customFieldsRA[i].fieldExportID),
          inputType: _.trim(customFieldsRA[i].fieldinput),
          valueType: 'single'
        };
      }

      // Process each attendee in roster
      for (let i = 0; i < roster.length; i++) {
        // Convert all keys to lowercase
        const attendeeObj = _.mapKeys(roster[i], (v, k) => k.toLowerCase());

        // Get this attendee
        const findAttendeeObj = await _attendeeService.findAttendeeObj(
          0,
          Number(attendeeObj.regid),
          0,
          vert
        );

        if (!findAttendeeObj) {
          console.warn(`Attendee not found for regID: ${attendeeObj.regid}`);
          continue;
        }

        // Clone activity and change objects
        const thisActivityObj = _.cloneDeep(activityObj);
        const thisChangeObj = _.cloneDeep(changeObj);

        // Prep activity object
        thisActivityObj.c.push(Number(findAttendeeObj.c));
        thisActivityObj.u.push(Number(findAttendeeObj.u));
        thisActivityObj.tgt = {
          u: Number(findAttendeeObj.u),
          uf: findAttendeeObj.uf,
          ul: findAttendeeObj.ul,
          ue: findAttendeeObj.ue
        };

        // Prep change object
        thisChangeObj.e = Number(findAttendeeObj.e);
        thisChangeObj.c = Number(findAttendeeObj.c);
        thisChangeObj.u = Number(findAttendeeObj.u);

        // Update attendee travel fields
        await this.updateAttendee(
          attendeeObj,
          vert,
          thisActivityObj,
          thisChangeObj,
          findAttendeeObj
        );

        // Update custom prompts
        await this.updateAttendeeCustomPrompts(
          attendeeObj,
          customFieldsObj,
          eventID,
          vert,
          thisActivityObj,
          thisChangeObj,
          findAttendeeObj
        );
      }

      return { success: true, processed: roster.length };
    } catch (error) {
      console.error('Error importing travel fields:', error);
      throw error;
    }
  }

  /**
   * Update attendee travel fields
   */
  async updateAttendee(attendeeObj, vert, activityObj, changeObj, findAttendeeObj) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');

      // Build dynamic UPDATE query
      let updateFields = [];
      const sqlParams = {};
      const mongoObj = {};
      const changeRA = [];

      // Hotel check-in
      if (attendeeObj.hotel_checkin && _.trim(attendeeObj.hotel_checkin) !== '') {
        updateFields.push('hotelcheckin = @hotelcheckin');
        sqlParams.hotelcheckin = new Date(attendeeObj.hotel_checkin);
        mongoObj.hi = new Date(attendeeObj.hotel_checkin);
        changeRA.push(_.assign({}, changeObj, {
          col: 'hotelcheckin',
          vaf: new Date(attendeeObj.hotel_checkin),
          vbf: findAttendeeObj.hi || '--undefined--'
        }));
      }

      // Hotel check-out
      if (attendeeObj.hotel_checkout && _.trim(attendeeObj.hotel_checkout) !== '') {
        updateFields.push('hotelcheckout = @hotelcheckout');
        sqlParams.hotelcheckout = new Date(attendeeObj.hotel_checkout);
        mongoObj.ho = new Date(attendeeObj.hotel_checkout);
        changeRA.push(_.assign({}, changeObj, {
          col: 'hotelcheckout',
          vaf: new Date(attendeeObj.hotel_checkout),
          vbf: findAttendeeObj.ho || '--undefined--'
        }));
      }

      // Hotel
      if (attendeeObj.hotel && _.trim(attendeeObj.hotel) !== '') {
        const hotelValue = _.truncate(_.trim(attendeeObj.hotel), { length: 80, omission: '' });
        updateFields.push('hotel = @hotel');
        sqlParams.hotel = hotelValue;
        mongoObj.ht = hotelValue;
        changeRA.push(_.assign({}, changeObj, {
          col: 'hotel',
          vaf: attendeeObj.hotel,
          vbf: findAttendeeObj.ht || '--undefined--'
        }));
      }

      // Room type
      if (attendeeObj.room_type && _.trim(attendeeObj.room_type) !== '') {
        const roomTypeValue = _.truncate(_.trim(attendeeObj.room_type), { length: 25, omission: '' });
        updateFields.push('roomtype = @roomtype');
        sqlParams.roomtype = roomTypeValue;
        mongoObj.ry = roomTypeValue;
        changeRA.push(_.assign({}, changeObj, {
          col: 'roomtype',
          vaf: attendeeObj.room_type,
          vbf: findAttendeeObj.ry || '--undefined--'
        }));
      }

      // Travel method
      if (attendeeObj.travel_method && _.trim(attendeeObj.travel_method) !== '') {
        const travelMethodValue = _.truncate(_.trim(attendeeObj.travel_method), { length: 50, omission: '' });
        updateFields.push('travelmethod = @travelmethod');
        sqlParams.travelmethod = travelMethodValue;
        mongoObj.tm = travelMethodValue;
        changeRA.push(_.assign({}, changeObj, {
          col: 'travelmethod',
          vaf: attendeeObj.travel_method,
          vbf: findAttendeeObj.tm || '--undefined--'
        }));
      }

      // Departure city
      if (attendeeObj.departure_city && _.trim(attendeeObj.departure_city) !== '') {
        const departureCityValue = _.truncate(_.trim(attendeeObj.departure_city), { length: 150, omission: '' });
        updateFields.push('departure_city = @departure_city');
        sqlParams.departure_city = departureCityValue;
        mongoObj.dc = departureCityValue;
        changeRA.push(_.assign({}, changeObj, {
          col: 'departure_city',
          vaf: attendeeObj.departure_city,
          vbf: findAttendeeObj.dc || '--undefined--'
        }));
      }

      // If no fields to update, skip
      if (updateFields.length === 0) {
        return;
      }

      // Update change object
      const thisChangeObj = _.assign({}, changeObj);
      thisChangeObj.avy = 'attendee';
      thisChangeObj.act = 'update';
      thisChangeObj.fil = { contestant_id: Number(attendeeObj.regid) };
      thisChangeObj.src = 'eventContestant';

      // Update activity object
      const thisActivityObj = _.assign({}, activityObj);
      thisActivityObj.desc.push('updateAttendee()');
      thisActivityObj._d = true;
      thisActivityObj.fm = attendeeObj;

      // Purge non-changes
      const filteredChangeRA = await _changeService.purgeNonChanges(changeRA);

      // Build activity change array
      const activityChangeRA = filteredChangeRA.map(chg => ({
        avy: chg.avy,
        act: chg.act,
        fil: chg.fil,
        src: chg.src,
        col: chg.col,
        vaf: chg.vaf,
        vbf: chg.vbf
      }));
      thisActivityObj.chg = activityChangeRA;

      // Update MSSQL
      const qryStr = `
        USE ${dbName};
        UPDATE eventContestant
        SET ${updateFields.join(', ')}, user_id = user_id
        WHERE contestant_id = @regID
      `;

      const request = new sql.Request();
      request.input('regID', sql.Int, Number(attendeeObj.regid));

      // Add parameters
      if (sqlParams.hotelcheckin) {
        request.input('hotelcheckin', sql.Date, sqlParams.hotelcheckin);
      }
      if (sqlParams.hotelcheckout) {
        request.input('hotelcheckout', sql.Date, sqlParams.hotelcheckout);
      }
      if (sqlParams.hotel) {
        request.input('hotel', sql.VarChar, sqlParams.hotel);
      }
      if (sqlParams.roomtype) {
        request.input('roomtype', sql.VarChar, sqlParams.roomtype);
      }
      if (sqlParams.travelmethod) {
        request.input('travelmethod', sql.VarChar, sqlParams.travelmethod);
      }
      if (sqlParams.departure_city) {
        request.input('departure_city', sql.VarChar, sqlParams.departure_city);
      }

      await request.query(qryStr);

      // Update MongoDB
      await attendeesCollection.updateOne(
        { c: Number(attendeeObj.regid), sg: { $exists: false } },
        {
          $currentDate: { lu: { $type: 'date' } },
          $set: mongoObj
        }
      );

      // Log changes
      if (filteredChangeRA.length > 0) {
        await _changeService.insertDataChangeActivity(filteredChangeRA, vert);
      }

      // Log activity
      await _activityService.insertAttendeeRegActivity(thisActivityObj, vert);
    } catch (error) {
      console.error('Error updating attendee:', error);
      throw error;
    }
  }

  /**
   * Update attendee custom prompts
   */
  async updateAttendeeCustomPrompts(attendeeObj, customFieldsObj, eventID, vert, activityObj, changeObj, findAttendeeObj) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get existing prompts
      const findAttendeePromptsRA = await _attendeeService.findAttendeePromptsRA(
        0,
        Number(findAttendeeObj.c),
        0,
        vert
      );

      // Build query params array
      const qryParamRA = [];
      for (const key in customFieldsObj) {
        if (attendeeObj[key]) {
          qryParamRA.push(_.assign({
            value: String(attendeeObj[key])
          }, customFieldsObj[key]));
        }
      }

      if (qryParamRA.length === 0) {
        return;
      }

      // Build SQL query
      let qryStr = `USE ${dbName};`;
      const updateQry = `
        IF NOT EXISTS (
          SELECT recordID
          FROM user_custom
          WHERE user_id = @userID
            AND eventID = @eventID
            AND field_id = @fieldID
        )
          BEGIN
            INSERT INTO user_custom (
              user_id,
              field_id,
              prompt,
              varchardata,
              eventID
            )
            VALUES (
              @userID,
              @fieldID,
              @prompt,
              @varchardata,
              @eventID
            )
          END
        ELSE
          BEGIN
            UPDATE user_custom
            SET varchardata = @varchardata
            WHERE user_id = @userID
              AND eventID = @eventID
              AND field_id = @fieldID
          END
      `;

      // Build query string with all updates
      for (let i = 0; i < qryParamRA.length; i++) {
        qryStr += updateQry
          .replace(/@fieldID/g, String(qryParamRA[i].fieldID))
          .replace(/@prompt/g, `@prompt_${i}`)
          .replace(/@varchardata/g, `@varchardata_${i}`)
          .replace(/@userID/g, String(attendeeObj.userid))
          .replace(/@eventID/g, String(eventID));
      }

      // Build SQL request and add parameters
      const request = new sql.Request();
      const changeRA = [];
      const mongoRA = [];
      const thisActivityObj = _.assign({}, activityObj);
      const thisChangeObj = _.assign({}, changeObj);

      thisActivityObj.desc.push('updateAttendeeCustomPrompts()');
      thisActivityObj._d = true;
      thisActivityObj.fm = attendeeObj;

      thisChangeObj.avy = 'custom prompt';
      thisChangeObj.act = 'upsert';
      thisChangeObj.src = 'user_custom';
      thisChangeObj.col = 'varchardata';

      for (let i = 0; i < qryParamRA.length; i++) {
        request.input(`prompt_${i}`, sql.VarChar, _.truncate(_.trim(qryParamRA[i].prompt), { length: 500, omission: '' }));
        request.input(`varchardata_${i}`, sql.VarChar, _.trim(qryParamRA[i].value));

        // Build mongo update array
        mongoRA.push({
          body: {
            fieldID: Number(qryParamRA[i].fieldID),
            fieldLabel: _.trim(qryParamRA[i].prompt),
            data: _.trim(qryParamRA[i].value),
            eventSpecific: (Number(eventID) > 0) ? 1 : 0,
            export: _.trim(qryParamRA[i].export),
            valueType: 'single',
            src: 'import service',
            userID: Number(attendeeObj.userid)
          },
          pathParameters: {
            contestantID: Number(attendeeObj.regid),
            vert: vert
          }
        });

        // Get before value
        const beforeVal = _.map(
          _.filter(findAttendeePromptsRA, { fi: Number(qryParamRA[i].fieldID) }),
          'dt'
        ).join();

        changeRA.push(_.assign({}, thisChangeObj, {
          fil: {
            user_id: Number(attendeeObj.userid),
            eventID: Number(eventID),
            field_id: Number(qryParamRA[i].fieldID)
          },
          vaf: _.trim(qryParamRA[i].value),
          vbf: (beforeVal !== '') ? beforeVal : '--undefined--',
          lbl: _.truncate(_.trim(qryParamRA[i].prompt), { length: 500, omission: '...' })
        }));
      }

      // Purge non-changes
      const filteredChangeRA = await _changeService.purgeNonChanges(changeRA);

      // Build activity change array
      const activityChangeRA = filteredChangeRA.map(chg => ({
        avy: chg.avy,
        act: chg.act,
        fil: chg.fil,
        src: chg.src,
        col: chg.col,
        vaf: chg.vaf,
        vbf: chg.vbf,
        lbl: chg.lbl
      }));
      thisActivityObj.chg = activityChangeRA;

      // Execute SQL
      await request.query(qryStr);

      // Update MongoDB for each custom prompt
      for (let i = 0; i < mongoRA.length; i++) {
        await _attendeeService.updateAttendeePromptResponse(mongoRA[i], {});
      }

      // Log changes
      if (filteredChangeRA.length > 0) {
        await _changeService.insertDataChangeActivity(filteredChangeRA, vert);
      }

      // Log activity
      await _activityService.insertAttendeeRegActivity(thisActivityObj, vert);
    } catch (error) {
      console.error('Error updating attendee custom prompts:', error);
      throw error;
    }
  }
}

export default new ImportService();

