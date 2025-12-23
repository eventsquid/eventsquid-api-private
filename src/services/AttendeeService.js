/**
 * Attendee Service
 * Migrated from Mantle AttendeeService.js
 * This is a placeholder - needs full implementation migration
 */

import { getDatabase } from '../utils/mongodb.js';
import _ from 'lodash';

class AttendeeService {
  /**
   * Find attendee prompts (custom fields)
   */
  async findAttendeePromptsRA(userID, regID, eventID, vert) {
    try {
      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');
      
      let filterObj = {};
      
      if (userID > 0 && eventID > 0) {
        filterObj = {
          u: userID,
          e: eventID
        };
      } else if (regID > 0) {
        filterObj = {
          c: regID
        };
      }
      
      // Ignore any simple guests of this attendee
      filterObj.sg = { $exists: false };
      
      const attendee = await attendeesCollection.findOne(
        filterObj,
        { projection: { _id: 0, ce: 1 } }
      );
      
      return attendee?.ce || [];
    } catch (error) {
      console.error('Error finding attendee prompts:', error);
      throw error;
    }
  }

  /**
   * Column sets for different resultsets
   */
  getColumnSets() {
    return {
      "grouptool": {
        "columns": { "_id": 0, "c": 1, "ul": 1, "uf": 1, "ue": 1, "pn": 1, "rt": 1, "u": 1, "hsu": 1, "uc": 1, "ai": 1, "sg": 1, "hs": 1 },
        "sort": { "ul": 1, "uf": 1 }
      },
      "dashsearch": {
        "columns": { "_id": 0, "c": 1, "u": 1, "ul": 1, "uf": 1, "ue": 1, "rt": 1, "tp": 1, "nd": 1, "td": 1, "py": 1, "ci": 1, "ciu": 1, "gu": 1, "uc": 1, "hsu": 1, "sg": 1, "hs": 1, "rc": 1, "ar": 1, "pa": 1, "ps": 1, "rb": 1, "fees": 1, "fs": 1, "br": 1, "lr": 1 },
        "sort": { "ul": 1, "uf": 1 }
      },
      "custom": {
        "columns": {},
        "sort": { "ul": 1, "uf": 1 }
      }
    };
  }

  /**
   * Find attendees with filters
   */
  async findAttendees(request) {
    try {
      const { filter, resultset, columns, limit: limitParam } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!vert) {
        throw new Error('Vertical is required');
      }

      if (!resultset) {
        throw new Error('Resultset is required');
      }

      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');

      // Get column set
      const columnSets = this.getColumnSets();
      let columnSet = columnSets[resultset];
      
      if (!columnSet) {
        // Use custom columns if provided
        columnSet = {
          columns: columns || {},
          sort: { "ul": 1, "uf": 1 }
        };
      }

      // If custom columns provided, merge them
      if (columns && typeof columns === 'object') {
        columnSet.columns = { ...columnSet.columns, ...columns };
      }

      // Handle special column requirements
      const finalColumns = { ...columnSet.columns };
      
      // If tableAssignments column requested, also need ai
      if (finalColumns.tableAssignments) {
        finalColumns.ai = 1;
      }

      // If company info columns requested, need cmpy
      const compColRA = Object.keys(finalColumns).filter(key => 
        key.startsWith('cbad') || key.startsWith('csad') || key.startsWith('cmid')
      );
      if (compColRA.length > 0) {
        finalColumns.cmpy = 1;
      }

      // Get limit from filter if present
      let limit = limitParam;
      const filterCopy = filter ? { ...filter } : {};
      if (filterCopy.hasOwnProperty('limit')) {
        limit = filterCopy.limit;
        delete filterCopy.limit;
      }

      // Find attendees
      let query = attendeesCollection.find(filterCopy || {}, { projection: finalColumns });
      
      if (limit) {
        query = query.limit(Number(limit));
      }

      const attendees = await query
        .sort(columnSet.sort)
        .toArray();

      return attendees;
    } catch (error) {
      console.error('Error finding attendees:', error);
      throw error;
    }
  }

  /**
   * Find and pivot attendees
   * Wrapper that pivots nested arrays into columns
   */
  async findAndPivotAttendees(request) {
    try {
      // First get the base attendees
      const attendees = await this.findAttendees(request);
      
      // TODO: Implement full pivot logic
      // This is a complex method that:
      // - Pivots fees array into columns (f_123, etc.)
      // - Pivots custom prompts (ce) into columns (ce_456, etc.)
      // - Pivots table assignments into columns (g_789, etc.)
      // - Adds event data, timezone conversions, etc.
      // For now, return the base attendees
      // Full implementation can be added incrementally
      
      return attendees;
    } catch (error) {
      console.error('Error finding and pivoting attendees:', error);
      throw error;
    }
  }

  /**
   * Delete attendee prompt response
   */
  async deleteAttendeePromptResponse(request) {
    try {
      const { contestantID } = request.pathParameters || {};
      const { fieldID, optionID, eventSpecific, userID } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!contestantID || !fieldID || !vert) {
        throw new Error('Contestant ID, field ID, and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');
      const usersCollection = db.collection('users');

      const fi = Number(fieldID);
      const o = Number(optionID || 0);
      
      let attendeeFilter = { c: Number(contestantID), '_id.g': 0 };
      let actionType = ['Deleted event-specific response from attendee'];

      // If this is NOT event specific, filter on user to bridge all events
      if (Number(eventSpecific) === 0) {
        attendeeFilter = { u: Number(userID), '_id.g': 0 };
        actionType = ['Deleted non-event-specific response from all attendee records for this user'];
      }

      // Update attendee records
      const attendeeUpdate = await attendeesCollection.updateMany(
        attendeeFilter,
        {
          $pull: { ce: { fi: fi, ...(o > 0 ? { o: o } : {}) } },
          $currentDate: { lu: { $type: 'date' } }
        }
      );

      // If NOT event-specific, also update user prompts
      if (Number(eventSpecific) === 0) {
        actionType.push('Deleted non-event-specific response from this user');
        
        await usersCollection.updateOne(
          { u: Number(userID) },
          { $pull: { ucf: { fi: fi, ...(o > 0 ? { o: o } : {}) } } }
        );
      }

      return {
        actions: actionType,
        status: 'success'
      };
    } catch (error) {
      console.error('Error deleting attendee prompt response:', error);
      throw error;
    }
  }

  /**
   * Update attendee prompt response
   */
  async updateAttendeePromptResponse(request) {
    try {
      const { contestantID } = request.pathParameters || {};
      const { 
        fieldID, 
        optionID, 
        data, 
        fieldLabel, 
        export: exportVal,
        eventSpecific, 
        userID,
        valueType,
        src,
        optAttr
      } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!contestantID || !fieldID || !vert) {
        throw new Error('Contestant ID, field ID, and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');
      const usersCollection = db.collection('users');
      const eventsCollection = db.collection('events');

      const fi = Number(fieldID);
      const o = Number(optionID || 0);
      const dt = String(data || '');
      const fl = String(fieldLabel || '');
      const fx = String(exportVal || '');
      const srcStr = String(src || '');
      
      let attendeeFilter = { c: Number(contestantID), '_id.g': 0 };
      let actionType = ['Recorded event-specific response from attendee'];
      const contestantIDRA = [Number(contestantID)];

      // If NOT event specific, filter on user
      if (Number(eventSpecific) === 0) {
        attendeeFilter = { u: Number(userID), '_id.g': 0 };
        actionType = ['Recorded non-event-specific response from all attendee records for this user'];
      }

      // Build pull filter - for single value type, remove all options for this field
      const pullFilter = (valueType === 'single') ? { fi: fi } : { fi: fi, o: o };

      // Build the response object to add
      const responseObj = {
        fi: fi,
        fl: fl,
        dt: dt,
        fx: fx,
        src: srcStr
      };

      if (o > 0) {
        responseObj.o = o;
      }

      if (optAttr) {
        responseObj.oa = String(optAttr);
      }

      // Update attendee records - pull existing, then add new
      await attendeesCollection.updateMany(
        attendeeFilter,
        {
          $pull: { ce: pullFilter },
          $currentDate: { lu: { $type: 'date' } }
        }
      );

      await attendeesCollection.updateMany(
        attendeeFilter,
        {
          $push: { ce: responseObj },
          $currentDate: { lu: { $type: 'date' } }
        }
      );

      // If NOT event-specific, also update user prompts
      if (Number(eventSpecific) === 0) {
        actionType.push('Recorded non-event-specific response from this user');
        
        await usersCollection.updateOne(
          { u: Number(userID) },
          {
            $pull: { ucf: pullFilter }
          }
        );

        await usersCollection.updateOne(
          { u: Number(userID) },
          {
            $push: { ucf: responseObj }
          }
        );
      }

      return {
        actions: actionType,
        status: 'success',
        contestantIDs: contestantIDRA
      };
    } catch (error) {
      console.error('Error updating attendee prompt response:', error);
      throw error;
    }
  }

  /**
   * Update attendee event documents
   * Fetches document data from MSSQL and updates MongoDB attendee record
   */
  async updateAttendeeEventDocs(request) {
    try {
      const { contestantID } = request.pathParameters || {};
      const { s3RootURL, domain } = request.body || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!contestantID || !vert) {
        throw new Error('Contestant ID and vertical are required');
      }

      const { getConnection, getDatabaseName, TYPES } = await import('../utils/mssql.js');
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');
      const moment = (await import('moment')).default;

      // Query document data from MSSQL
      const docsQuery = `
        USE ${dbName};
        SELECT
            ed.doc_id AS [d],
            uu.filename AS [fn],
            CASE WHEN( ISNULL( uu.filenameS3, '' ) != '' AND LEFT( uu.filenameS3, 7 ) != 'Invalid' ) THEN
                uu.filenameS3
            ELSE
                NULL
            END AS [f3],
            CASE WHEN( ISNULL( uu.filenameS3, '' ) != '' AND LEFT( uu.filenameS3, 7 ) != 'Invalid' ) THEN
                '${s3RootURL || ''}/' + uu.filenameS3
            WHEN ( LEFT( uu.filename, 3 ) = 'kei' ) THEN
                'https://kei.${domain || ''}/s3c/' + uu.filename
            WHEN ( LEFT( uu.filename, 3 ) = 'squid1' ) THEN
                'https://squid1.${domain || ''}/s3c/' + uu.filename
            WHEN ( LEFT( uu.filename, 3 ) = 'squid2' ) THEN
                'https://squid2.${domain || ''}/s3c/' + uu.filename
            ELSE
                NULL
            END AS [upu],
            uu.uploadtitle AS [upt],
            CASE WHEN( uu.uploadType = 'peg' ) THEN 'jpeg' ELSE uu.uploadType END AS [upy],
            uu.uploadDate AS [udt],
            uu.uploadDate AS [udi],
            CASE WHEN( ISNULL( uu.thumbS3, '' ) != '' AND LEFT( uu.thumbS3, 7 ) != 'Invalid' ) THEN
                '${s3RootURL || ''}/' + uu.thumbS3
            ELSE
                NULL
            END AS [thu],
            uu.uploadCategory AS [upc]
        FROM eventdocs ed
            INNER JOIN user_uploads uu ON uu.doc_id = ed.doc_id
                AND uu.deleted = 0
                AND uu.resource_type = 'document-upload'
        WHERE ISNULL( ed.contestant_id, 0 ) = @contestantID
      `;

      let docData = await connection.sql(docsQuery)
        .parameter('contestantID', TYPES.Int, Number(contestantID))
        .execute();

      // Process document data
      if (docData.length) {
        docData = docData.map(doc => {
          // Format the date
          if (doc.udt) {
            doc.udt = moment(doc.udt).format('YYYY-MM-DD');
          }
          // Remove null values
          return _.omitBy(doc, _.isNil);
        });

        // Update attendee with document data
        await attendeesCollection.updateOne(
          { '_id.c': Number(contestantID) },
          {
            $currentDate: { lu: { $type: 'date' } },
            $set: { ups: docData }
          }
        );
      } else {
        // Remove document data if none found
        await attendeesCollection.updateOne(
          { '_id.c': Number(contestantID) },
          {
            $currentDate: { lu: { $type: 'date' } },
            $unset: { ups: '' }
          }
        );
      }

      return {
        status: 'success',
        message: 'Event Docs Updated'
      };
    } catch (error) {
      console.error('Error updating attendee event docs:', error);
      throw error;
    }
  }

  /**
   * Find attendee object by API
   */
  async findAttendeeObjByAPI(request) {
    // TODO: Migrate implementation
    console.log('findAttendeeObjByAPI called');
    return {};
  }

  /**
   * Update attendee last updated timestamp
   */
  async updateAttendeeLU(request) {
    try {
      const { attendeeID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!attendeeID || !vert) {
        throw new Error('Attendee ID and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');

      // Update the last updated timestamp
      await attendeesCollection.updateMany(
        { c: Number(attendeeID) },
        { $currentDate: { lu: { $type: 'date' } } }
      );

      return { status: 'success' };
    } catch (error) {
      console.error('Error updating attendee last updated:', error);
      throw error;
    }
  }

  /**
   * Update attendee last updated by user
   */
  async updateAttendeeLUbyUser(request) {
    try {
      const { userID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!userID || !vert) {
        throw new Error('User ID and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');

      // Update the last updated timestamp for all attendees with this user ID
      await attendeesCollection.updateMany(
        { u: Number(userID) },
        { $currentDate: { lu: { $type: 'date' } } }
      );

      return { status: 'success' };
    } catch (error) {
      console.error('Error updating attendee last updated by user:', error);
      throw error;
    }
  }

  /**
   * Update attendee last updated by user and event
   */
  async updateAttendeeLUbyUserAndEvent(request) {
    try {
      const { userID, eventID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!userID || !eventID || !vert) {
        throw new Error('User ID, Event ID, and vertical are required');
      }

      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');

      // Update the last updated timestamp for attendees matching user and event
      await attendeesCollection.updateMany(
        { u: Number(userID), e: Number(eventID) },
        { $currentDate: { lu: { $type: 'date' } } }
      );

      return { status: 'success' };
    } catch (error) {
      console.error('Error updating attendee last updated by user and event:', error);
      throw error;
    }
  }

  /**
   * Find attendee object
   * Can search by userID+eventID or by regID (contestant ID)
   */
  async findAttendeeObj(userID, regID, eventID, vert) {
    try {
      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');

      let filterObj = {};

      if (Number(userID) > 0 && Number(eventID) > 0) {
        filterObj = {
          u: Number(userID),
          e: Number(eventID)
        };
      } else if (Number(regID) > 0) {
        filterObj = {
          c: Number(regID)
        };
      } else {
        return null;
      }

      // Ignore simple guests
      filterObj.sg = { $exists: false };

      const attendee = await attendeesCollection.findOne(
        filterObj,
        {
          projection: {
            _id: 0,
            a: 1,  // affiliate_id
            c: 1,  // contestant_id
            u: 1,  // user_id
            e: 1,  // event_id
            et: 1, // event_title
            uf: 1, // user_firstname
            ul: 1, // user_lastname
            ue: 1, // user_email
            tm: 1, // timestamp
            ht: 1, // has_ticket
            hi: 1, // has_invitation
            ho: 1, // has_order
            dc: 1, // date_created
            ry: 1  // registration_year
          }
        }
      );

      return attendee || null;
    } catch (error) {
      console.error('Error finding attendee object:', error);
      throw error;
    }
  }

  /**
   * Find attendee object by API (wrapper for findAttendeeObj)
   */
  async findAttendeeObjByAPI(request) {
    try {
      const { attendeeID } = request.pathParameters || {};
      const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      if (!attendeeID || !vert) {
        throw new Error('Attendee ID and vertical are required');
      }

      return await this.findAttendeeObj(0, Number(attendeeID), 0, vert);
    } catch (error) {
      console.error('Error finding attendee object by API:', error);
      throw error;
    }
  }
}

export default new AttendeeService();

