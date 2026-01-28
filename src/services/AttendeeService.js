/**
 * Attendee Service
 * Migrated from Mantle AttendeeService.js
 * This is a placeholder - needs full implementation migration
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import moment from 'moment-timezone';
import _ from 'lodash';
import EventService from './EventService.js';
import { getRegItemsByEventID } from '../functions/regItems.js';
import { getBiosByEventID } from '../functions/reports.js';
import { utcToTimezone } from '../functions/conversions.js';

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
      // Handle body that might be an array (Lambda sometimes sends arrays)
      let body = request.body;
      if (Array.isArray(body) && body.length > 0) {
        body = body[0];
      }
      
      const { filter, resultset, columns, limit: limitParam } = body || {};
      // Check request.vert (set by requireVertical), pathParameters, then headers
      const vert = request.vert || request.pathParameters?.vert || request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      console.log(`[AttendeeService] findAttendees called with body:`, JSON.stringify(body));
      console.log(`[AttendeeService] filter:`, JSON.stringify(filter));
      console.log(`[AttendeeService] resultset:`, resultset);
      
      if (!vert) {
        throw new Error('Vertical is required');
      }

      if (!resultset) {
        throw new Error('Resultset is required in request body');
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
      
      // Always include u (user ID) - needed for ub (user bio) lookup and general functionality
      finalColumns.u = 1;
      
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
      if (filterCopy && filterCopy.hasOwnProperty('limit')) {
        limit = filterCopy.limit;
        delete filterCopy.limit;
      }

      // Build MongoDB filter - handle special cases but preserve filter structure
      // IMPORTANT: Match old codebase behavior exactly
      const mongoFilter = {};
      const hasIdG = filterCopy && filterCopy.hasOwnProperty('_id.g') && filterCopy['_id.g'] === 0;
      
      // OLD CODE BEHAVIOR: Default to rc=1 (complete registrations only) unless explicitly set to 0
      // Check if rc is explicitly set to 0 in the filter
      const rcExplicitlyZero = filterCopy && filterCopy.hasOwnProperty('rc') && filterCopy.rc === 0;
      
      // Only process filter if it exists and has keys
      if (filterCopy && typeof filterCopy === 'object') {
        for (const key in filterCopy) {
          const value = filterCopy[key];
          
          // Skip empty strings (they shouldn't be used in queries)
          if (value === '' || value === null || value === undefined) {
            continue;
          }
          
          // Handle event ID (e) - support both Number and String formats for compatibility
          if (key === 'e') {
            const numValue = Number(value);
            mongoFilter[key] = {
              $in: [numValue, String(numValue)]
            };
          }
          // Handle _id.g: 0 - should match where _id.g is 0 OR doesn't exist
          else if (key === '_id.g' && value === 0) {
            // Don't add it here - we'll handle it with $or at the end
            continue;
          }
          // Handle p: 0 - in the old codebase, p: 0 means "don't filter on profile" (ignore p field)
          // So we skip adding it to the filter entirely
          else if (key === 'p' && value === 0) {
            // Skip p: 0 - it means don't filter on profile
            continue;
          }
          // Handle rc (regcomplete) - OLD CODE BEHAVIOR: Default to rc=1 (complete only) unless explicitly set to 0
          // If rc is not in filter, default to rc=1 (show only complete registrations)
          // If rc is 0, show both rc=0 and rc=1 (show all registrations)
          // If rc is 1, show only rc=1 (show only complete registrations)
          else if (key === 'rc') {
            if (value === 0) {
              // rc=0 means "show all" - don't filter on rc (include both complete and incomplete)
              // Don't add rc to filter
            } else {
              // Default to rc=1 (complete only) if rc is 1 or not explicitly 0
              mongoFilter[key] = 1;
            }
          }
          // Copy all other fields as-is (MongoDB handles nested fields like '_id.g' correctly)
          else {
            mongoFilter[key] = value;
          }
        }
      }
      
      // OLD CODE BEHAVIOR: Default to rc=1 (complete registrations only) unless explicitly set to 0
      // If rc was not explicitly set to 0, add rc=1 filter
      if (!rcExplicitlyZero && !mongoFilter.hasOwnProperty('rc')) {
        mongoFilter.rc = 1;
      }
      
      // If _id.g: 0 was in the filter, use $or to match 0 or missing
      // Note: p: 0 means "don't filter on profile" so it's already been skipped above
      if (hasIdG) {
        const baseFilter = { ...mongoFilter };
        mongoFilter.$or = [
          { ...baseFilter, '_id.g': 0 },
          { ...baseFilter, '_id.g': { $exists: false } }
        ];
        // Remove base filter keys since they're now in $or
        Object.keys(baseFilter).forEach(k => {
          if (k !== '$or') delete mongoFilter[k];
        });
      }

      console.log(`[AttendeeService] ===== FILTER DEBUG =====`);
      console.log(`[AttendeeService] Original filter:`, JSON.stringify(filter, null, 2));
      console.log(`[AttendeeService] Processed mongoFilter:`, JSON.stringify(mongoFilter, null, 2));
      console.log(`[AttendeeService] rc in original filter:`, filter?.rc);
      console.log(`[AttendeeService] rc in mongoFilter:`, mongoFilter.rc || (mongoFilter.$or && mongoFilter.$or[0] && mongoFilter.$or[0].rc) || 'not set');
      console.log(`[AttendeeService] p in original filter:`, filter?.p);
      console.log(`[AttendeeService] _id.g in original filter:`, filter?.['_id.g'] || filter?.['_id']?.g);
      console.log(`[AttendeeService] Query limit:`, limit);
      console.log(`[AttendeeService] Using vertical:`, vert);
      console.log(`[AttendeeService] Database name:`, db.databaseName);
      console.log(`[AttendeeService] Collection name: attendees`);
      console.log(`[AttendeeService] Sort:`, JSON.stringify(columnSet.sort));

      // Find attendees
      let query = attendeesCollection.find(mongoFilter || {}, { projection: finalColumns });
      
      if (limit) {
        query = query.limit(Number(limit));
      }

      const attendees = await query
        .sort(columnSet.sort)
        .toArray();

      console.log(`[AttendeeService] Found ${attendees.length} attendees with full filter`);
      console.log(`[AttendeeService] First 3 attendees (c, u, ul, uf, rc):`, 
        attendees.slice(0, 3).map(a => ({ c: a.c, u: a.u, ul: a.ul, uf: a.uf, rc: a.rc })));
      
      // Debug: Check total count with just event filter (no rc, _id.g, etc.)
      // Extract event filter from mongoFilter (could be in $or or directly)
      let eventFilter = null;
      if (mongoFilter.e) {
        eventFilter = mongoFilter.e;
      } else if (mongoFilter.$or && mongoFilter.$or[0] && mongoFilter.$or[0].e) {
        eventFilter = mongoFilter.$or[0].e;
      } else if (filter && filter.e) {
        eventFilter = { $in: [Number(filter.e), String(filter.e)] };
      }
      
      if (eventFilter) {
        // Handle $in format for event filter
        const simpleEventFilter = typeof eventFilter === 'object' && eventFilter.$in 
          ? { e: { $in: eventFilter.$in } }
          : { e: eventFilter };
        
        const totalCount = await attendeesCollection.countDocuments(simpleEventFilter);
        console.log(`[AttendeeService] Total attendees for event (no other filters): ${totalCount}`);
        
        // Also check with just event + rc filter
        const rcValue = mongoFilter.rc || (mongoFilter.$or && mongoFilter.$or[0] && mongoFilter.$or[0].rc) || (filter && filter.rc);
        if (rcValue !== undefined) {
          const rcFilter = { ...simpleEventFilter, rc: rcValue };
          const rcCount = await attendeesCollection.countDocuments(rcFilter);
          console.log(`[AttendeeService] Attendees with event + rc=${rcValue}: ${rcCount}`);
          
          // Check attendees without rc filter
          const noRcCount = await attendeesCollection.countDocuments(simpleEventFilter);
          console.log(`[AttendeeService] Attendees with event but rc != ${rcValue} or missing: ${totalCount - rcCount}`);
          
          // Check with event + rc + _id.g: 0 (or missing) but no p filter
          const idGFilter = { ...rcFilter };
          const idGOr = [
            { ...idGFilter, '_id.g': 0 },
            { ...idGFilter, '_id.g': { $exists: false } }
          ];
          const idGCount = await attendeesCollection.countDocuments({ $or: idGOr });
          console.log(`[AttendeeService] Attendees with event + rc=${rcValue} + (_id.g=0 OR missing): ${idGCount}`);
        }
        
        // Get a sample of recent attendees to see their field values
        const recentAttendees = await attendeesCollection
          .find(simpleEventFilter)
          .sort({ rt: -1 }) // Sort by registration time descending
          .limit(5)
          .toArray();
        console.log(`[AttendeeService] Sample of 5 most recent attendees (showing rc, _id.g, p fields):`);
        recentAttendees.forEach((att, idx) => {
          console.log(`  [${idx + 1}] c: ${att.c}, u: ${att.u}, rc: ${att.rc}, _id.g: ${att._id?.g}, p: ${att.p}, rt: ${att.rt}`);
        });
        
        // Check specifically for records with rc: 0
        const rcZeroCount = await attendeesCollection.countDocuments({ ...simpleEventFilter, rc: 0 });
        const rcOneCount = await attendeesCollection.countDocuments({ ...simpleEventFilter, rc: 1 });
        const rcMissingCount = await attendeesCollection.countDocuments({ ...simpleEventFilter, rc: { $exists: false } });
        console.log(`[AttendeeService] Attendees with rc=0: ${rcZeroCount}, rc=1: ${rcOneCount}, rc missing: ${rcMissingCount}`);
      }

      // Always return an array, even if empty
      return Array.isArray(attendees) ? attendees : [];
    } catch (error) {
      console.error('Error finding attendees:', error);
      throw error;
    }
  }

  /**
   * Find and pivot attendees
   * Wrapper that pivots nested arrays into columns
   * Pivots fees, custom prompts, table assignments, and adds event data/timezone conversions
   */
  async findAndPivotAttendees(request) {
    try {
      const { filter, pivot = [], pivotinclude = [], columns = {} } = request.body || {};
      // Check request.vert (set by requireVertical), pathParameters, then headers
      const vert = request.vert || request.pathParameters?.vert || request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
      
      // First get the base attendees
      let attendees = await this.findAttendees(request);
      
      console.log(`[AttendeeService] findAndPivotAttendees: Got ${attendees.length} attendees from findAttendees`);
      console.log(`[AttendeeService] First 3 attendees before pivot (c, u, ul, uf):`, 
        attendees.slice(0, 3).map(a => ({ c: a.c, u: a.u, ul: a.ul, uf: a.uf })));
      
      let eventData = {};
      let zoneData = {};
      let regItemsRA = [];
      let regItemsCustomIDObj = {};
      let tableAssignerRA = [];
      const dateFormat = 'MM-DD-YYYY h:mm A z';

      // If we have an event filter, get event data and timezone info
      if (filter && filter.e) {
        zoneData = await EventService.getEventTimezoneData(filter.e, vert);
        eventData = await EventService.getEventData({
          pathParameters: { eventID: String(filter.e) },
          headers: { vert }
        });
        regItemsRA = await getRegItemsByEventID(filter.e, null, vert);

        // Build custom ID lookup object
        for (let x = 0; x < regItemsRA.length; x++) {
          if (regItemsRA[x].customID) {
            regItemsCustomIDObj[`f${String(regItemsRA[x].eventFeeID)}`] = _.trim(regItemsRA[x].customID);
          }
        }
      }

      // If we want table assignments, get them
      if (pivot.indexOf('tableAssignments') >= 0) {
        const db = await getDatabase(null, vert);
        const tableAssignerCollection = db.collection('tableAssignerData');
        
        tableAssignerRA = await tableAssignerCollection.find(
          {
            $or: [
              { e: Number(filter.e) },
              { e: String(filter.e) }
            ]
          },
          {
            projection: { _id: 0, groupingID: 1, assignments: 1, blockName: 1 }
          }
        ).toArray();

        // Loop assignments and add to attendees
        for (let z = 0; z < tableAssignerRA.length; z++) {
          const groupingID = String(tableAssignerRA[z].groupingID);

          for (let y = 0; y < tableAssignerRA[z].assignments.length; y++) {
            const attendeeID = String(tableAssignerRA[z].assignments[y].attendeeData.ai);
            const blockName = String(tableAssignerRA[z].assignments[y].blockName);

            const groupedAttendee = _.find(attendees, { ai: attendeeID });

            if (groupedAttendee) {
              if (!groupedAttendee.tableAssignments) {
                groupedAttendee.tableAssignments = [];
              }

              groupedAttendee.tableAssignments.push({
                groupingID: groupingID,
                blockName: blockName
              });
            }
          }
        }
      }

      // Loop the attendees and pivot data
      for (let i = 0; i < attendees.length; i++) {
        const attendee = attendees[i];

        // Add event data columns if requested
        if (columns.tx && eventData.tx) {
          attendee.tx = _.trim(eventData.tx);
        }
        if (columns.ebi && eventData.ebi) {
          attendee.ebi = moment.tz(eventData.ebi, zoneData.zoneName).format(dateFormat);
        }
        if (columns.eei && eventData.eei) {
          attendee.eei = moment.tz(eventData.eei, zoneData.zoneName).format(dateFormat);
        }
        if (columns.vm && eventData.vm) {
          attendee.vm = _.trim(eventData.vm);
        }

        // Convert timezone for attendee dates
        if (attendee.ciu) {
          attendee.ciu = utcToTimezone(attendee.ciu, zoneData.zoneName, dateFormat);
        }
        if (attendee.co) {
          attendee.co = utcToTimezone(attendee.co, zoneData.zoneName, dateFormat);
        }
        if (attendee.rt) {
          attendee.rt = utcToTimezone(attendee.rt, zoneData.zoneName, dateFormat);
        }

        // Pivot fees array into columns
        if ((pivot.indexOf('fees') >= 0 || columns.booths) && attendee.fees) {
          for (let j = 0; j < attendee.fees.length; j++) {
            const fee = attendee.fees[j];

            // Convert timezone for fee check-in/out dates
            if (fee.ci && zoneData.fees && zoneData.fees[fee.f]) {
              fee.ci = utcToTimezone(fee.ci, zoneData.fees[fee.f], dateFormat);
            }
            if (fee.co && zoneData.fees && zoneData.fees[fee.f]) {
              fee.co = utcToTimezone(fee.co, zoneData.fees[fee.f], dateFormat);
            }

            // Add custom ID if available
            if (regItemsCustomIDObj[`f${String(fee.f)}`]) {
              fee.cid = regItemsCustomIDObj[`f${String(fee.f)}`];
            }

            // Handle booths (special fee type 999000999)
            if (Number(fee.f) === 999000999 && columns.booths) {
              if (!attendee.booths) {
                attendee.booths = [];
              }
              attendee.booths.push({
                pr: Number(fee.pr || 0),
                fm: _.trim(fee.fm),
                bn: _.trim(fee.bn)
              });
            }

            // If this fee is included in the output, pivot it
            if (pivotinclude.indexOf(`f_${String(fee.f)}`) >= 0) {
              const feeIDKey = `f_${String(fee.f)}`;
              
              // If the fee id already exists (duplicate), add quantity and price
              if (attendee.hasOwnProperty(feeIDKey)) {
                attendee[feeIDKey].q += fee.q;
                attendee[feeIDKey].pr += fee.pr;
              } else {
                attendee[feeIDKey] = fee;
              }
            }
          }

          delete attendee.fees;
        }

        // Pivot custom prompts (ce) array into columns
        if (pivot.indexOf('ce') >= 0 && attendee.ce) {
          for (let k = 0; k < attendee.ce.length; k++) {
            const cst = attendee.ce[k];

            // If this custom prompt is included in the output AND we have data
            if (pivotinclude.indexOf(`ce_${String(cst.fi)}`) >= 0 && cst.dt) {
              const ceKey = `ce_${String(cst.fi)}`;
              
              if (!attendee[ceKey]) {
                attendee[ceKey] = [];
              }

              // Append this response
              attendee[ceKey].push(String(cst.dt));
            }
          }

          delete attendee.ce;
        }

        // Pivot table assignments into columns
        if (pivot.indexOf('tableAssignments') >= 0 && attendee.tableAssignments) {
          for (let l = 0; l < attendee.tableAssignments.length; l++) {
            const grp = attendee.tableAssignments[l];

            // If this grouping assignment is included in the output AND we have data
            if (pivotinclude.indexOf(`g_${String(grp.groupingID)}`) >= 0 && grp.blockName) {
              attendee[`g_${String(grp.groupingID)}`] = String(grp.blockName);
            }
          }

          delete attendee.tableAssignments;
        }

        // Pivot company info (cmpy) array
        if (pivot.indexOf('cmpy') >= 0 && attendee.cmpy && attendee.cmpy.length > 0) {
          if (attendee.cmpy[0].cbad) {
            attendee.cbad = _.trim(attendee.cmpy[0].cbad.replace('ZZ,', ''));
          }
          if (attendee.cmpy[0].csad) {
            attendee.csad = _.trim(attendee.cmpy[0].csad.replace('ZZ,', ''));
          }
          if (attendee.cmpy[0].cmid) {
            attendee.cmid = Number(attendee.cmpy[0].cmid);
          }
          if (attendee.cmpy[0].cmn) {
            attendee.cmn = _.trim(attendee.cmpy[0].cmn);
          }
          if (attendee.cmpy[0].cmbn) {
            attendee.cmbn = _.trim(attendee.cmpy[0].cmbn);
          }
          if (attendee.cmpy[0].cmsn) {
            attendee.cmsn = _.trim(attendee.cmpy[0].cmsn);
          }

          delete attendee.cmpy;
        }

        // Pivot master account (ps) array
        if (pivot.indexOf('ps') >= 0 && attendee.ps && attendee.ps.length > 0) {
          if (attendee.ps[0].ue) {
            attendee.pe = _.trim(attendee.ps[0].ue);
          }
          if (attendee.ps[0].uf) {
            attendee.pf = _.trim(attendee.ps[0].uf);
          }
          if (attendee.ps[0].ul) {
            attendee.pl = _.trim(attendee.ps[0].ul);
          }
          if (attendee.ps[0].u) {
            attendee.pt = Number(attendee.ps[0].u);
          }

          delete attendee.ps;
        }

        // Handle host info (hs) array
        if (attendee.hs && attendee.hs.length > 0) {
          let hostName = '';

          if (attendee.hs[0].uf) {
            hostName = `${hostName} ${_.trim(attendee.hs[0].uf)}`;
          }
          if (attendee.hs[0].ul) {
            hostName = `${hostName} ${_.trim(attendee.hs[0].ul)}`;
          }
          if (attendee.hs[0].ue) {
            hostName = `${hostName} (${_.trim(attendee.hs[0].ue)})`;
          }

          attendee.hs = _.trim(hostName);
        }
      }

      // Add user bios if we have an event
      // Always add ub field when available, regardless of column settings
      if (filter && filter.e) {
        try {
          const userBios = await getBiosByEventID(filter.e, vert);
          
          console.log(`[AttendeeService] Fetched ${userBios?.length || 0} bios for event ${filter.e}`);
          
          if (userBios && Array.isArray(userBios) && userBios.length > 0) {
            // Create a lookup map for faster matching (handle both Number and String u values)
            const bioMap = new Map();
            let biosWithUbio = 0;
            
            userBios.forEach(bio => {
              if (bio && bio.u) {
                // Store by both Number and String keys to handle type mismatches
                const uNum = Number(bio.u);
                const uStr = String(bio.u);
                
                // Check for ubio (user bio) - this is what we want
                if (bio.ubio) {
                  bioMap.set(uNum, bio.ubio);
                  bioMap.set(uStr, bio.ubio);
                  biosWithUbio++;
                }
              }
            });
            
            console.log(`[AttendeeService] Found ${biosWithUbio} bios with ubio field`);
            
            // Match attendees to bios
            let matchedCount = 0;
            attendees.forEach((attendee, index) => {
              if (attendee && attendee.u) {
                // Try both Number and String lookups
                const uNum = Number(attendee.u);
                const uStr = String(attendee.u);
                const bio = bioMap.get(uNum) || bioMap.get(uStr);
                if (bio) {
                  attendee.ub = bio;
                  matchedCount++;
                }
              }
            });
            
            console.log(`[AttendeeService] Added ub to ${matchedCount} of ${attendees.length} attendees`);
          } else {
            console.log(`[AttendeeService] No bios returned for event ${filter.e}`);
          }
        } catch (error) {
          // Log but don't fail if bios can't be fetched
          console.warn('Error fetching user bios:', error.message);
          console.warn('Error stack:', error.stack);
        }
      } else {
        console.log(`[AttendeeService] No event filter (filter.e) provided, skipping ub field`);
      }

      // OLD CODE BEHAVIOR: Don't re-sort after pivoting - preserve the original MongoDB sort order
      // The MongoDB query already sorted by { ul: 1, uf: 1 }, so we keep that order
      // Re-sorting can cause inconsistencies if the sort logic differs slightly

      // Always return an array, even if empty
      return Array.isArray(attendees) ? attendees : [];
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
      const sql = await getConnection(vert);
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

      const request = new sql.Request();
      request.input('contestantID', sql.Int, Number(contestantID));
      const result = await request.query(docsQuery);
      let docData = result.recordset;

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
            hi: 1, // hotel check-in
            ho: 1, // hotel check-out
            ht: 1, // hotel
            ry: 1, // room type
            tm: 1, // travel method
            dc: 1  // departure city
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

