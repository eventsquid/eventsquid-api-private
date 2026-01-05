/**
 * Reports functions
 * Migrated from Mantle functions/reports
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { ObjectId } from 'mongodb';
import _ from 'lodash';
import moment from 'moment-timezone';
import { utcToTimezone, timezoneToUTCDateObj } from '../functions/conversions.js';
import EventService from '../services/EventService.js';

/**
 * Get event details by GUID
 */
export async function getEventDetailsByGUID(eventGUID, vert, session) {
  try {
    const db = await getDatabase(null, vert);
    const eventsColl = db.collection('events');

    const events = await eventsColl.find({
      eg: String(eventGUID),
      a: Number(session.affiliate_id),
      _x: { $ne: true }
    }, {
      projection: { _id: 0, e: 1, eg: 1, et: 1, ech: 1, eef: 1, an: 1 }
    }).toArray();

    return events;
  } catch (error) {
    console.error('Error getting event details by GUID:', error);
    throw error;
  }
}

/**
 * Get report details by GUID
 */
export async function getReportDetailsByGUID(reportGUID, vert, session) {
  try {
    const db = await getDatabase(null, vert);
    const templatesColl = db.collection('report-templates');

    const templatesRA = await templatesColl.find({
      idg: String(reportGUID),
      _x: { $ne: true }
    }, {
      projection: { _id: 0, eg: 1, a: 1, rsc: 1, rsf: 1, tmn: 1, lu: 1, own: 1 }
    }).toArray();

    const returnObj = {
      reportDetails: {}
    };

    // If we have a matching report template
    if (templatesRA.length > 0) {
      // Assign the report details
      returnObj.reportDetails = templatesRA[0];

      // Determine if this user owns this report
      returnObj.isOwner = (Number(returnObj.reportDetails.own.u) === Number(session.user_id));
      delete returnObj.reportDetails.own;

      // Get the event details
      returnObj.eventDetails = await getEventDetailsByGUID(
        returnObj.reportDetails.eg,
        vert,
        { affiliate_id: Number(returnObj.reportDetails.a) }
      );

      // If we DO NOT have a matching event
      if (returnObj.eventDetails.length === 0) {
        // May as well blow out the report details
        returnObj.reportDetails = {};
      }
    }

    return returnObj;
  } catch (error) {
    console.error('Error getting report details by GUID:', error);
    throw error;
  }
}

/**
 * Get reporting menu
 */
export async function getReportingMenu(eventID, affiliateID, user_admin_level, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Get application settings
    const applicationRA = await connection.sql(`
      USE ${dbName};
      SELECT
        LOWER(RTRIM(LTRIM(attribute_name))) AS [key],
        LOWER(RTRIM(LTRIM(attribute_valueText))) AS value
      FROM a_globalVars
      WHERE attribute_name IN (
        'bringingDisabled',
        'bringingOption',
        'contestant',
        'corporatesite',
        'exhibitor',
        'eventBringingSingular',
        'guestlabelshort',
        'hideExhibitors',
        'sitename',
        'tableAssigner'
      )
    `).execute();

    const application = {};
    for (let i = 0; i < applicationRA.length; i++) {
      const thisObj = applicationRA[i];
      application[_.trim(thisObj.key)] = thisObj.value;
    }

    // Get event details
    const getEventRA = await connection.sql(`
      USE ${dbName};
      SELECT
        allowbringing,
        e._guid AS eg,
        event_id,
        event_title,
        event_type_id,
        guestlimit,
        jobslive,
        minorreg,
        vendorreg,
        (
          SELECT COUNT(1)
          FROM eventBooths
          WHERE event_id = @eventID
        ) AS anybooths,
        (
          SELECT COUNT(1)
          FROM ballots
          WHERE event_id = @eventID
        ) AS anyballots
      FROM b_events e
        INNER JOIN b_affiliates a ON a.affiliate_id = e.affiliate_id
      WHERE e.event_id = @eventID
        AND e.affiliate_id = @affiliateID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

    const getEvent = getEventRA[0] || {};

    return {
      application: application,
      getEvent: getEvent,
      session: {
        user_admin_level: Number(user_admin_level)
      }
    };
  } catch (error) {
    console.error('Error getting reporting menu:', error);
    throw error;
  }
}

/**
 * Get bios by event ID
 */
export async function getBiosByEventID(eventID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const bioRA = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_getBiosByEventID @eventID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

    // Clean up bios - remove nulls and clean HTML
    for (let i = 0; i < bioRA.length; i++) {
      bioRA[i] = _.omitBy(bioRA[i], _.isNull);

      if (bioRA[i].sbio) {
        // Clean HTML and decode URI component
        bioRA[i].sbio = decodeURIComponent(bioRA[i].sbio)
          .replace(/<[^>]*>/g, '') // Strip HTML
          .replace(/"/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (bioRA[i].ubio) {
        bioRA[i].ubio = decodeURIComponent(bioRA[i].ubio)
          .replace(/<[^>]*>/g, '') // Strip HTML
          .replace(/"/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    return bioRA;
  } catch (error) {
    console.error('Error getting bios by event ID:', error);
    throw error;
  }
}

/**
 * Check duplicate template name
 */
export async function checkDupTemplateName(eventID, ty, tmn, vert) {
  try {
    const db = await getDatabase(null, vert);
    const templatesColl = db.collection('report-templates');

    const regExLiteral = _.trim(tmn);
    const tmnRegEx = new RegExp(regExLiteral, 'i');

    const templatesRA = await templatesColl.find({
      e: Number(eventID),
      ty: _.trim(ty),
      tmn: tmnRegEx,
      _x: { $ne: true }
    }, {
      projection: { _id: 0, lu: 1, tmn: 1, own: 1 }
    }).toArray();

    return templatesRA.length > 0;
  } catch (error) {
    console.error('Error checking duplicate template name:', error);
    throw error;
  }
}

/**
 * Get templates
 */
export async function getTemplates(eventID, vert, ty, session) {
  try {
    const db = await getDatabase(null, vert);
    const templatesColl = db.collection('report-templates');

    const templatesRA = await templatesColl.find({
      e: Number(eventID),
      ty: _.trim(ty),
      _x: { $ne: true }
    }, {
      projection: { _id: 0, idg: 1, lu: 1, rsc: 1, rsf: 1, nm: 1, tmn: 1, pvt: 1, own: 1 }
    })
    .sort({ tmn: 1 })
    .toArray();

    // Loop the templates and verify ownership
    for (let i = 0; i < templatesRA.length; i++) {
      templatesRA[i].isOwner = (Number(templatesRA[i].own.u) === Number(session.user_id));
    }

    return templatesRA;
  } catch (error) {
    console.error('Error getting templates:', error);
    throw error;
  }
}

/**
 * Find event report config
 * NOTE: This is a complex function that requires EventService.updateEventConfig
 * For now, implementing the basic structure
 */
export async function findEventReportConfig(request) {
  try {
    const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
    const eventGUID = request.pathParameters?.eventGUID;

    const db = await getDatabase(null, vert);
    const events = db.collection('events');

    // Get event data
    const eventIDs = await events.find({
      eg: String(eventGUID)
    }).toArray();

    if (!eventIDs || eventIDs.length === 0) {
      return {};
    }

    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Get event booths
    const eventBooths = await connection.sql(`
      USE ${dbName};
      SELECT COUNT(record_id) AS boothCount
      FROM eventBooths
      WHERE event_id = @eventID
        AND ISNULL(contestant_id, 0) > 0
    `)
    .parameter('eventID', TYPES.Int, Number(eventIDs[0].e))
    .execute();

    const boothCount = Number(eventBooths[0]?.boothCount || 0);

    // Get bundles
    const profileToItemsQry = await connection.sql(`
      USE ${dbName};
      SELECT
        bundle_id,
        bundle_name,
        bundle_cats
      FROM event_fee_bundles
      WHERE event_id = @eventID
        AND ISNULL(bundle_active, 0) = 1
    `)
    .parameter('eventID', TYPES.Int, Number(eventIDs[0].e))
    .execute();

    const profileToItemsObj = {};
    profileToItemsQry.forEach((profile) => {
      profileToItemsObj[`_${profile.bundle_id}`] = String(profile.bundle_cats).split(',').map((regItem) => {
        return Number(regItem);
      });
    });

    // Get event config with aggregation
    const eventConfig = await events.aggregate([
      {
        $match: {
          eg: String(eventGUID)
        }
      },
      {
        $lookup: {
          from: 'tableAssignerConfig',
          let: { e: '$e' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$eventID', String(eventIDs[0].e)]
                }
              }
            },
            {
              $project: { _id: 0, groupingID: 1, groupingName: 1, active: 1 }
            }
          ],
          as: 'groupings'
        }
      },
      {
        $project: {
          e: 1.0,
          ebt: 1.0,
          et: 1.0,
          groupings: 1.0,
          pfs: 1.0,
          evfs: 1.0,
          rgf: 1.0,
          ech: 1.0,
          eef: 1.0,
          an: 1.0,
          _id: 0.0
        }
      }
    ]).toArray();

    if (!eventConfig || eventConfig.length === 0) {
      return {};
    }

    const config = eventConfig[0];
    let fees = config.evfs || [];

    // Filter registration form prompts
    if (config.rgf) {
      config.rgf.forEach((regForm) => {
        regForm.eq = _.filter(regForm.eq, (item) => item.on === true || item === true);
      });
    }

    // Process fee categories
    const feeCategories = [
      { cat: 'Registration', groups: [] },
      { cat: 'Race', groups: [] },
      { cat: 'Activity', groups: [] },
      { cat: 'Facility', groups: [] },
      { cat: 'Goods', groups: [] },
      { cat: 'General', groups: [] },
      { cat: 'Meals', groups: [] },
      { cat: 'Membership', groups: [] },
      { cat: 'Spectator', groups: [] },
      { cat: 'Sponsorship', groups: [] },
      { cat: 'Other', groups: [] }
    ];

    let ungroupedFees = [];
    const groupOrder = [];
    const feeGroupsObj = {};

    fees.forEach((fee) => {
      let newFee = {};
      let thisFeeGroup = '';

      if (fee.f) {
        if (!fee.gri || Number(fee.gri) === 0) {
          fee.fgn = 'Ungrouped';
          fee.fgo = 0;
        }
        thisFeeGroup = `_${String(fee.fgo)}_${_.camelCase(fee.fgn)}_${_.camelCase(fee.fc)}`;
      }

      if (!feeGroupsObj[thisFeeGroup]) {
        feeGroupsObj[thisFeeGroup] = {
          gri: Number(fee.gri),
          fgo: Number(fee.fgo),
          fgn: String(fee.fgn),
          fc: String(fee.fc),
          fees: []
        };
        groupOrder.push(thisFeeGroup);
      }

      newFee = {
        f: Number(fee.f),
        for: Number(fee.for),
        fm: String(fee.fm)
      };

      if (fee.op) {
        newFee.op = [].concat(fee.op);
      }

      ungroupedFees.push(_.assign({}, newFee));

      if (fee.isp && _.trim(fee.isp) !== '') {
        newFee.isp = _.trim(fee.isp);
      }

      if (fee.efml) {
        newFee.efml = [].concat(fee.efml);
      }

      if (fee.szs) {
        newFee.szs = [].concat(fee.szs);
      }

      feeGroupsObj[thisFeeGroup].fees.push(newFee);
    });

    fees = [];
    groupOrder.forEach((group) => {
      const feeGroup = feeGroupsObj[String(group)];
      if (typeof feeGroup === 'object') {
        fees.push(feeGroup);
      }
    });

    fees.forEach((feeGroup) => {
      const thisFeeCategory = String(feeGroup.fc);
      const matchingCategory = feeCategories.find((category) => {
        return category.cat.toLowerCase() === thisFeeCategory.toLowerCase();
      });

      if (matchingCategory) {
        matchingCategory.groups.push(feeGroup);
      } else {
        feeCategories[feeCategories.length - 1].groups.push(feeGroup);
      }
    });

    config.fees = feeCategories;
    config.boothCount = boothCount;
    config.feeRef = ungroupedFees;
    config.pfsToFees = profileToItemsObj;

    delete config.evfs;

    return config;
  } catch (error) {
    console.error('Error finding event report config:', error);
    throw error;
  }
}

/**
 * Get registrant filters
 * Gets registration items, profiles, categories, and options for filtering
 */
export async function getRegistrantFilters(eventID, vert) {
  try {
    const db = await getDatabase(null, vert);
    const eventsColl = db.collection('events');

    const events = await eventsColl.find(
      { e: Number(eventID) },
      { projection: { _id: 0, pfs: 1, evfs: 1 } }
    ).toArray();

    const eventObj = events[0] || {};
    const returnObj = {
      evfs: [],
      pfs: eventObj.pfs || [],
      cats: [],
      ops: []
    };

    if (eventObj.evfs) {
      // Filter down to only active fees
      let activeFees = _.filter(eventObj.evfs, { fa: 1 });
      activeFees = _.orderBy(activeFees, ['for', 'fm'], ['asc', 'asc']);

      const _griObj = {};
      let _gri = '';
      let _fgn = '';

      for (let i = 0; i < activeFees.length; i++) {
        // Set fee groups if they don't exist
        activeFees[i].fgn = activeFees[i].fgn || _.trim(activeFees[i].fc);
        activeFees[i].fgo = activeFees[i].fgo || 0;

        if (!activeFees[i].gri) {
          _fgn = _.trim(activeFees[i].fgn.toLowerCase());

          // See if we have a matching fake group id
          if (!(Number(_griObj[_fgn]) >= 0)) {
            // Create a fake groupID
            _gri = Number(i);
            // And create an entry for fake fee groups
            _griObj[_fgn] = Number(_gri);
          }

          activeFees[i].gri = Number(_griObj[_fgn]);
        }

        returnObj.evfs.push(_.pick(activeFees[i], ['f', 'fm', 'for', 'op', 'gri']));
        returnObj.cats.push(_.pick(activeFees[i], ['gri', 'fgn', 'fgo']));
        returnObj.ops.push(_.pick(activeFees[i], ['op']));
      }

      // Uniquify the fee categories
      returnObj.cats = _.uniqBy(returnObj.cats, 'gri');
      // And sort them
      returnObj.cats = _.orderBy(returnObj.cats, ['fgo', 'fgn'], ['asc', 'asc']);

      // Loop them and add items
      for (let i = 0; i < returnObj.cats.length; i++) {
        // Add the items
        returnObj.cats[i].items = _.filter(returnObj.evfs, { gri: Number(returnObj.cats[i].gri) });
        // And sort them
        returnObj.cats[i].items = _.orderBy(returnObj.cats[i].items, ['for', 'fm'], ['asc', 'asc']);
      }
    }

    // Loop the options (subclasses)
    let _opsRA = [];
    for (let i = 0; i < returnObj.ops.length; i++) {
      if (returnObj.ops[i].op) {
        _opsRA = _.concat(_opsRA, returnObj.ops[i].op);
      }
    }

    returnObj.ops = _.orderBy(_opsRA, ['sn', 'on'], ['asc', 'asc']);

    return _.pick(returnObj, ['cats', 'pfs', 'ops']);
  } catch (error) {
    console.error('Error getting registrant filters:', error);
    throw error;
  }
}

/**
 * Generate date range filters
 * Helper function for date range filtering
 */
async function generateDateRangeFilters(dateRangeStr, dateRangeRA, zoneName) {
  const returnObj = {
    start: false,
    end: false
  };

  // Evaluate what type of date range we're looking for
  // Today
  if (dateRangeStr === 'today') {
    returnObj.start = timezoneToUTCDateObj(moment().startOf('day'), zoneName);
    returnObj.end = timezoneToUTCDateObj(moment().endOf('day'), zoneName);
  }
  // Yesterday
  else if (dateRangeStr === 'yesterday') {
    returnObj.start = timezoneToUTCDateObj(moment().subtract(1, 'days').startOf('day'), zoneName);
    returnObj.end = timezoneToUTCDateObj(moment().subtract(1, 'days').endOf('day'), zoneName);
  }
  // Past-7 days
  else if (dateRangeStr === 'past-7') {
    returnObj.start = timezoneToUTCDateObj(moment().subtract(7, 'days').startOf('day'), zoneName);
    returnObj.end = timezoneToUTCDateObj(moment().endOf('day'), zoneName);
  }
  // Past-30 days
  else if (dateRangeStr === 'past-30') {
    returnObj.start = timezoneToUTCDateObj(moment().subtract(30, 'days').startOf('day'), zoneName);
    returnObj.end = timezoneToUTCDateObj(moment().endOf('day'), zoneName);
  }
  // This month to date
  else if (dateRangeStr === 'this-month') {
    returnObj.start = timezoneToUTCDateObj(moment().startOf('month'), zoneName);
    returnObj.end = timezoneToUTCDateObj(moment().endOf('day'), zoneName);
  }
  // Custom range
  else if (dateRangeStr === 'custom-range' && dateRangeRA) {
    returnObj.start = timezoneToUTCDateObj(moment(dateRangeRA[0]).startOf('day'), zoneName);
    returnObj.end = timezoneToUTCDateObj(moment(dateRangeRA[1]).endOf('day'), zoneName);
  }

  return returnObj;
}

/**
 * Registrant report
 * Generates registrant report using stored procedure with filtering and column selection
 */
export async function registrantReport(eventID, vert, body) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);
    const _eventService = new EventService();

    const zoneData = await _eventService.getEventTimezoneData(eventID, vert);
    const dateFormat = 'MM-DD-YYYY h:mm A z';

    let regRA = [];
    let regStart = null;
    let regEnd = null;
    let itemID = [];
    let itemOptionID = [];
    let colRA = [];
    let selectStr = '';

    const colObj = {
      c: 'ISNULL( c, 0 ) AS c',
      uf: 'ISNULL( uf, \'\' ) AS uf',
      ul: 'ISNULL( ul, \'\' ) AS ul',
      uc: 'ISNULL( uc, \'\' ) AS uc',
      td: 'ISNULL( td, 0.00 ) AS td',
      cv: 'ISNULL( cv, 0.00 ) AS cv',
      rt: 'ISNULL( rt, \'\' ) AS rt',
      stl: 'ISNULL( stl, 0.00 ) AS stl',
      cu: 'ISNULL( cu, \'\' ) AS cu',
      tp: 'ISNULL( tp, 0.00 ) AS tp',
      pr: 'ISNULL( pr, 0.00 ) AS pr',
      q: 'ISNULL( q, 0 ) AS q',
      desc: 'ISNULL( [desc], \'\' ) AS [desc]',
      sz: 'ISNULL( sz, \'\' ) AS sz',
      f: 'ISNULL( f, 0 ) AS f',
      bo: 'ISNULL( bo, 0 ) AS bo',
      dt: 'ISNULL( dt, \'\' ) AS dt',
      fc: 'ISNULL( fc, \'\' ) AS fc',
      on: 'ISNULL( [on], \'\' ) AS [on]',
      sn: 'ISNULL( sn, \'\' ) AS sn',
      'o_c': 'ISNULL( o_c, 0 ) AS o_c',
      'o_f': 'ISNULL( o_f, 0 ) AS o_f',
      o: 'ISNULL( o, 0 ) AS o',
      fm: 'ISNULL( fm, \'\' ) AS fm',
      fl: 'ISNULL( fl, \'\' ) AS fl',
      as: 'ISNULL( [as], \'\' ) AS [as]',
      ast: 'ISNULL( ast, \'\' ) AS ast',
      ae: 'ISNULL( ae, \'\' ) AS ae',
      aet: 'ISNULL( aet, \'\' ) AS aet',
      'bo|f': 'CASE WHEN ( ISNULL( bo, 0 ) > 0 ) THEN ISNULL( bo, 0 ) ELSE ISNULL( f, 0 ) END AS [bo|f]',
      'fm&bo&desc': 'CASE WHEN ( RTRIM(LTRIM( ISNULL( fm, \'\' ) )) != \'\') THEN RTRIM(LTRIM( ISNULL( fm, \'\' ) )) ELSE \'\' END + CASE WHEN ( ISNULL( bo, 0 ) > 0 ) THEN \' Space Assigned:\' + ISNULL( [desc], \'\' ) ELSE \'\' END AS [fm&bo&desc]',
      'on&sn': 'CASE WHEN ( RTRIM(LTRIM( ISNULL( [on], \'\' ) )) !=\'\' ) THEN sn + \': \' + [on] ELSE \'\'  END AS [on&sn]',
      'fl&dt': 'CASE WHEN ( RTRIM(LTRIM( ISNULL( fl, \'\' ) )) != \'\' ) THEN fl + \': \' + dt ELSE \'\' END AS [fl&dt]',
      'q&pr&stl': '( ISNULL( q, 0 ) * ISNULL( pr, 0 ) ) + ISNULL( stl, 0 ) AS [q&pr&stl]',
      'q&pr': '( ISNULL( q, 0) * ISNULL( pr, 0) ) AS [q&pr]'
    };

    // If this has reg date ranges
    if (body._regDateRange && body._regDateRange.length > 0) {
      const dateRngFilter = await generateDateRangeFilters(
        body._regDateRange,
        body._dateRangeRA,
        zoneData.zoneName
      );
      regStart = dateRngFilter.start;
      regEnd = dateRngFilter.end;
    }

    // Process event fee IDs
    if (body._eventFeeID && body._eventFeeID.length > 0) {
      for (let i = 0; i < body._eventFeeID.length; i++) {
        // Get the item and option IDs
        itemID.push(Number(body._eventFeeID[i][0]));
        itemOptionID.push(Number(body._eventFeeID[i][1]));
      }
      itemID = itemID.join(',');
    }

    // Build query string
    let qryStr = `
      USE ${dbName};

      DECLARE @reportTbl TABLE (
        c INT,
        uf VARCHAR(255),
        ul VARCHAR(255),
        uc VARCHAR(255),
        td DECIMAL(10,2),
        cv DECIMAL(10,2),
        rt DATETIME NULL,
        stl DECIMAL(10,2),
        cu VARCHAR(8),
        tp DECIMAL(10,2),
        pr DECIMAL(10,2),
        q INT,
        [desc] VARCHAR(MAX),
        sz VARCHAR(8),
        f INT,
        bo INT,
        dt VARCHAR(MAX),
        fc VARCHAR(255),
        [on] VARCHAR(255),
        sn VARCHAR(255),
        o_c INT,
        o_f INT,
        o INT,
        fm VARCHAR(255),
        fl VARCHAR(255),
        [as] VARCHAR(255),
        ast VARCHAR(255),
        ae VARCHAR(255),
        aet VARCHAR(255)
      )

      INSERT INTO @reportTbl
        EXEC dbo.node_registrantReport @eventID, NULL, @regStart, @regEnd, @itemID

      SELECT *
      FROM @reportTbl
    `;

    // Build our returned columns
    if (body.selectedCols && body.selectedCols.length > 0) {
      // Loop our selected columns
      for (let i = 0; i < body.selectedCols.length; i++) {
        colRA.push(colObj[String(body.selectedCols[i])]);
      }

      // We always select the optionID
      colRA.push(colObj['o']);

      // Convert the columns array to a string
      selectStr = colRA.join(',');

      qryStr = qryStr.replace('SELECT *', `SELECT ${selectStr}`);
    }

    // Execute query
    regRA = await connection.sql(qryStr)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('regStart', TYPES.DateTime, (regStart === null || !regStart) ? null : new Date(regStart))
      .parameter('regEnd', TYPES.DateTime, (regEnd === null || !regEnd) ? null : new Date(regEnd))
      .parameter('itemID', TYPES.VarChar, (itemID === '') ? '' : _.trim(itemID))
      .execute();

    // Loop the records
    for (let i = 0; i < regRA.length; i++) {
      const thisRecord = regRA[i];

      // If this has an option which is not among those to be included
      if (itemOptionID.length > 0 && itemOptionID.indexOf(thisRecord.o) < 0) {
        thisRecord._remove = true;
      }

      // Convert registration time to timezone
      if (thisRecord.rt) {
        thisRecord.rt = utcToTimezone(thisRecord.rt, zoneData.zoneName, dateFormat);
      }
    }

    // Filter out the removed records
    return _.filter(regRA, function(o) { return !o._remove; });
  } catch (error) {
    console.error('Error generating registrant report:', error);
    throw error;
  }
}

/**
 * Generate registrant item filter list
 * Helper function to generate filter labels for export
 */
async function generateRegItemFilterList(eventID, feeFilterRA, vert) {
  try {
    const filtersObj = await getRegistrantFilters(eventID, vert);
    const returnRA = [];
    let category = {};
    let item = {};
    let option = {};

    // Loop the filter options
    for (let i = 0; i < filtersObj.cats.length; i++) {
      category = _.assign({}, filtersObj.cats[i]);

      // Loop the items
      for (let j = 0; j < category.items.length; j++) {
        item = _.assign({}, category.items[j]);

        // If we have options
        if (item.op && item.op.length > 0) {
          // Create an all options filter description
          returnRA.push({
            f: Number(item.f),
            o: 0,
            desc: `${item.fm}: All`
          });

          // Then loop the options
          for (let k = 0; k < item.op.length; k++) {
            option = _.assign({}, item.op[k]);

            // Create an option filter description
            returnRA.push({
              f: Number(item.f),
              o: Number(option.o),
              desc: `${item.fm}: ${option.on} ${option.sn}`
            });
          }
        } else {
          // Create an item filter description
          returnRA.push({
            f: Number(item.f),
            o: 0,
            desc: String(item.fm)
          });
        }
      }
    }

    // Now match against feeFilterRA
    const matchedLabels = [];
    for (let i = 0; i < feeFilterRA.length; i++) {
      const filter = _.concat([], feeFilterRA[i]);
      const result = returnRA.filter(obj => obj.f === Number(filter[0]));

      if (result.length) {
        const matched = _.find(returnRA, {
          f: Number(filter[0]),
          o: Number(filter[1])
        });
        if (matched) {
          matchedLabels.push(matched.desc || `Not found: f: ${filter[0]}, o: ${filter[1]}`);
        }
      }
    }

    // If the return array is empty
    if (matchedLabels.length === 0) {
      matchedLabels.push('All Registration Items');
    }

    return _.uniq(matchedLabels).sort().join(', ');
  } catch (error) {
    console.error('Error generating registrant item filter list:', error);
    throw error;
  }
}

/**
 * Registrant report export
 * Generates export data with column mapping and filter information
 */
export async function registrantReportExport(reportGUID, format, checkID, vert, session) {
  try {
    const isDefault = reportGUID.split('-')[0] === 'default';
    
    let defaultReport = {};
    if (isDefault) {
      defaultReport = {
        reportDetails: {
          eg: reportGUID.replace('default-', ''),
          a: Number(session.affiliate_id),
          lu: new Date(),
          rsc: [
            'c',
            'bo|f',
            'ul',
            'uf',
            'uc',
            'rt',
            'as',
            'ast',
            'ae',
            'aet',
            'fm&bo&desc',
            'on&sn',
            'sz',
            'fl&dt',
            'q',
            'pr',
            'q&pr',
            'stl',
            'q&pr&stl'
          ],
          rsf: {
            p: 0,
            f: 0,
            pd_rng: [],
            rt_rng: 'anytime',
            tr: {
              pd_rng: []
            },
            evfs: {
              ist: '',
              iet: ''
            }
          },
          tmn: 'Default'
        },
        eventDetails: await getEventDetailsByGUID(
          reportGUID.replace('default-', ''),
          vert,
          { affiliate_id: Number(session.affiliate_id) }
        )
      };
    }

    const reportDetail = isDefault
      ? defaultReport
      : await getReportDetailsByGUID(reportGUID, vert, session);

    const fakeFormScope = {
      _regDateRange: reportDetail.reportDetails.rsf.rt_rng,
      _dateRangeRA: reportDetail.reportDetails.rsf.rt_rngRA,
      _eventFeeID: reportDetail.reportDetails.rsf.f,
      selectedCols: reportDetail.reportDetails.rsc
    };

    const reportRA = await registrantReport(
      reportDetail.eventDetails[0].e,
      vert,
      fakeFormScope
    );

    const colsObj = {
      'c': 'Attendee ID',
      'bo|f': 'Item ID',
      'ul': 'Last',
      'uf': 'First',
      'uc': 'Organization',
      'rt': 'Reg Date',
      'as': 'Item Start Date',
      'ast': 'Item Start Time',
      'ae': 'Item End Date',
      'aet': 'Item End Time',
      'fm&bo&desc': 'Item',
      'on&sn': 'Options',
      'sz': 'Size',
      'fl&dt': 'Prompt',
      'q': 'Quantity',
      'pr': 'Price',
      'q&pr': 'Item Total',
      'stl': 'Fee',
      'q&pr&stl': 'Grand Total'
    };

    const selectRA = [];
    const colOrderRA = [
      'c', 'bo|f', 'ul', 'uf', 'uc', 'rt', 'as', 'ast', 'ae', 'aet',
      'fm&bo&desc', 'on&sn', 'sz', 'fl&dt', 'q', 'pr', 'q&pr', 'stl', 'q&pr&stl'
    ];
    const colsRA = reportDetail.reportDetails.rsc;
    const defaultObj = {};

    // Loop the columns in order of appearance
    for (let i = 0; i < colOrderRA.length; i++) {
      // If this column is among those selected for display
      if (colsRA.indexOf(colOrderRA[i]) >= 0) {
        const colName = colsObj[colOrderRA[i]];
        // Create a SQL alias
        selectRA.push(`[${colOrderRA[i]}] AS [${colName}]`);
        // Also add it to the default object
        defaultObj[colOrderRA[i]] = '';
      }
    }

    // Determine the date range for this export
    const dateRangeStr = String(reportDetail.reportDetails.rsf.rt_rng);
    let dateRangeFilter = '';
    const availableRanges = [
      { val: 'anytime', lbl: 'Anytime' },
      { val: 'today', lbl: 'Today' },
      { val: 'yesterday', lbl: 'Yesterday' },
      { val: 'this-month', lbl: 'This month' },
      { val: 'custom-range', lbl: 'Custom range' }
    ];

    if (dateRangeStr === 'custom-range') {
      dateRangeFilter = `${moment(reportDetail.reportDetails.rsf.rt_rngRA[0]).format('MMMM D, YYYY')} - ${moment(reportDetail.reportDetails.rsf.rt_rngRA[1]).format('MMMM D, YYYY')}`;
    } else {
      const rangeObj = _.find(availableRanges, { val: reportDetail.reportDetails.rsf.rt_rng });
      const dateRangeObj = {};

      // Generate the actual date ranges
      if (dateRangeStr === 'today') {
        dateRangeObj.start = moment().startOf('day');
        dateRangeObj.end = moment().endOf('day');
      } else if (dateRangeStr === 'yesterday') {
        dateRangeObj.start = moment().subtract(1, 'days').startOf('day');
        dateRangeObj.end = moment().subtract(1, 'days').endOf('day');
      } else if (dateRangeStr === 'past-7') {
        dateRangeObj.start = moment().subtract(7, 'days').startOf('day');
        dateRangeObj.end = moment().endOf('day');
      } else if (dateRangeStr === 'past-30') {
        dateRangeObj.start = moment().subtract(30, 'days').startOf('day');
        dateRangeObj.end = moment().endOf('day');
      } else if (dateRangeStr === 'this-month') {
        dateRangeObj.start = moment().startOf('month');
        dateRangeObj.end = moment().endOf('day');
      }

      if (rangeObj && dateRangeObj.start) {
        dateRangeFilter = `${rangeObj.lbl} (${moment(dateRangeObj.start).format('MMMM D, YYYY')} - ${moment(dateRangeObj.end).format('MMMM D, YYYY')})`;
      } else {
        dateRangeFilter = rangeObj ? rangeObj.lbl : 'Anytime';
      }
    }

    // Generate filter list
    const regItemFilterList = await generateRegItemFilterList(
      Number(reportDetail.eventDetails[0].e),
      reportDetail.reportDetails.rsf.f,
      vert
    );

    // Create import-breaking info (metadata at end of export)
    const importBreakingInfo = [];
    const junkDataObj = {};

    // Two empty rows
    importBreakingInfo.push(_.assign({}, defaultObj));
    importBreakingInfo.push(_.assign({}, defaultObj));

    // Report filters info
    junkDataObj[String(colOrderRA[0])] = 'Report Filters';
    importBreakingInfo.push(_.assign({}, defaultObj, junkDataObj));

    junkDataObj[String(colOrderRA[0])] = `Date Range: ${dateRangeFilter}`;
    importBreakingInfo.push(_.assign({}, defaultObj, junkDataObj));

    junkDataObj[String(colOrderRA[0])] = `Registration Items: ${regItemFilterList}`;
    importBreakingInfo.push(_.assign({}, defaultObj, junkDataObj));

    // Inject the report filters info into the end of the spreadsheet
    const finalReportRA = _.concat([], reportRA, importBreakingInfo);

    return {
      selectRA,
      reportRA: finalReportRA
    };
  } catch (error) {
    console.error('Error exporting registrant report:', error);
    throw error;
  }
}

/**
 * Get registrant transactions report
 * Gets transaction report using stored procedure
 */
export async function getRegistrantTransactionsReport(affiliateID, eventID, keyword, fromDate, toDate, payMethod, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_registrantTransactionsReport 
        @affiliateID,
        @eventID,
        @keyword,
        @fromDate,
        @toDate,
        @transactionTypeID,
        @paymentProcessor
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('keyword', TYPES.VarChar, keyword || '')
    .parameter('fromDate', TYPES.Date, fromDate || null)
    .parameter('toDate', TYPES.Date, toDate || null)
    .parameter('transactionTypeID', TYPES.Int, 0)  // Not used in Mantle version
    .parameter('paymentProcessor', TYPES.VarChar, payMethod || '')
    .execute();

    return results;
  } catch (error) {
    console.error('Error getting registrant transactions report:', error);
    throw error;
  }
}

/**
 * Save registrant template
 */
export async function saveRegistrantTemplate(eventID, vert, body, session) {
  try {
    const db = await getDatabase(null, vert);
    const templatesColl = db.collection('report-templates');

    const templateData = {
      ...body,
      e: Number(eventID),
      a: Number(session.affiliate_id),
      ty: 'registrant',
      da: new Date(),
      lu: new Date(),
      own: {
        ue: String(session.user_email || ''),
        uf: String(session.user_firstname || ''),
        ul: String(session.user_lastname || ''),
        u: Number(session.user_id)
      }
    };

    if (body.mode === 'new') {
      // Generate new GUID for template
      const { v4: uuidv4 } = await import('uuid');
      templateData.idg = uuidv4();
      templateData._id = templateData.idg;

      await templatesColl.insertOne(templateData);
      return { status: 'success', idg: templateData.idg };
    } else {
      // Update existing template
      await templatesColl.updateOne(
        { idg: body.idg, e: Number(eventID) },
        {
          $set: templateData,
          $currentDate: { lu: { $type: 'date' } }
        }
      );
      return { status: 'success', idg: body.idg };
    }
  } catch (error) {
    console.error('Error saving registrant template:', error);
    throw error;
  }
}

/**
 * Delete template
 */
export async function deleteTemplate(eventID, idg, reportType, vert, session) {
  try {
    const db = await getDatabase(null, vert);
    const templatesColl = db.collection('report-templates');

    await templatesColl.updateOne(
      {
        e: Number(eventID),
        idg: String(idg),
        ty: String(reportType),
        'own.u': Number(session.user_id)
      },
      {
        $set: { _x: true },
        $currentDate: { lu: { $type: 'date' } }
      }
    );

    return { status: 'success', message: 'Template deleted' };
  } catch (error) {
    console.error('Error deleting template:', error);
    throw error;
  }
}

/**
 * Share template
 */
export async function shareTemplate(body, session) {
  try {
    const vert = body.vert || session.vert;
    const db = await getDatabase(null, vert);
    const templatesColl = db.collection('report-templates');

    await templatesColl.updateOne(
      {
        idg: String(body.idg),
        'own.u': Number(session.user_id)
      },
      {
        $set: { pvt: !Boolean(body.pvt) },
        $currentDate: { lu: { $type: 'date' } }
      }
    );

    return { status: 'success', message: 'Template sharing updated' };
  } catch (error) {
    console.error('Error sharing template:', error);
    throw error;
  }
}

