/**
 * Reports functions
 * Migrated from Mantle functions/reports
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { ObjectId } from 'mongodb';
import _ from 'lodash';

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
 * NOTE: This is a placeholder - the actual implementation is complex
 */
export async function getRegistrantFilters(eventID, vert) {
  try {
    // TODO: Implement full registrant filters logic
    // This involves getting registration items, custom fields, date ranges, etc.
    return {
      registrationItems: [],
      customFields: [],
      dateRanges: []
    };
  } catch (error) {
    console.error('Error getting registrant filters:', error);
    throw error;
  }
}

/**
 * Registrant report
 * NOTE: This is a placeholder - the actual implementation is very complex
 */
export async function registrantReport(eventID, vert, body) {
  try {
    // TODO: Implement full registrant report logic
    // This involves complex filtering, sorting, pagination, etc.
    return [];
  } catch (error) {
    console.error('Error generating registrant report:', error);
    throw error;
  }
}

/**
 * Registrant report export
 * NOTE: This is a placeholder - the actual implementation is very complex
 */
export async function registrantReportExport(reportGUID, format, checkID, vert, session) {
  try {
    // TODO: Implement full registrant report export logic
    // This involves generating CSV, Excel, PDF, etc.
    return { status: 'success', message: 'Export pending implementation' };
  } catch (error) {
    console.error('Error exporting registrant report:', error);
    throw error;
  }
}

/**
 * Get registrant transactions report
 * NOTE: This is a placeholder - the actual implementation is complex
 */
export async function getRegistrantTransactionsReport(affiliateID, eventID, keyword, fromDate, toDate, payMethod, vert) {
  try {
    // TODO: Implement full registrant transactions report logic
    return [];
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

