/**
 * Registration Items functions
 * Migrated from Mantle functions/regItems
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import moment from 'moment-timezone';

/**
 * Get registration items by event ID
 */
export async function getRegItemsByEventID(eventID, fields, vert) {
  const connection = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  // Default set of fields
  const selectFields = fields && fields.length 
    ? fields.join() 
    : `
        ISNULL(g.color,'#444444') as groupBgColor,
        ISNULL(g.textcolor,'white') as groupColor,
        ISNULL(g.group_name,'Ungrouped') as group_name,
        ISNULL(g.group_order,999999) as group_order,
        f.orderBy,
        f.eventFeeID,
        f.activityStart,
        f.activityStartTime,
        f.activityEndTime,
        t.fee_name,
        f.customFeeName,
        f.CEUName,
        f.CEUValue,
        f.checkInCode,
        f.checkOutCode,
        f.customID,
        ISNULL(f.surveyID, 0) surveyID,
        (
            SELECT bundle_id
            FROM event_fee_bundles
            WHERE event_id = @eventID AND (',' + RTRIM(bundle_cats) + ',') LIKE '%,' + cast(f.eventFeeID as varchar(50))+ ',%' FOR JSON PATH
        ) as profiles,
        (
            SELECT ISNULL(
            (SELECT 1 WHERE EXISTS (
                SELECT au.eventFeeID
                FROM ceuAwarded au
                WHERE au.eventFeeID = f.eventFeeID
            ) OR EXISTS (
                SELECT du.eventFeeID
                FROM ceuDeclined du
                WHERE du.eventFeeID = f.eventFeeID
            )),0)
        ) as packageGrantCount,
        (
            SELECT DISTINCT
                categoryID,
                eventFeeID
            FROM ceuAwarded
            WHERE eventFeeID = f.eventFeeID
            FOR JSON PATH
        ) as ceuAwardedGrants,
        (
            SELECT DISTINCT
                categoryID,
                eventFeeID
            FROM ceuDeclined
            WHERE eventFeeID = f.eventFeeID
            FOR JSON PATH
        ) as ceuDeclinedGrants
    `;

  const items = await connection.sql(`
    USE ${dbName};
    SELECT
        ${selectFields}
    FROM
        event_fees f
        INNER JOIN event_fee_types t ON t.fee_type_id = f.fee_type_id
        LEFT JOIN event_fee_groups g ON g.group_id = f.group_id
    WHERE
        f.event_id = @eventID
        and ISNULL(f.invisible, 0) = 0
    ORDER BY
        t.fee_name DESC,
        ISNULL(g.group_order,999999),
        f.orderBy ASC,
        f.customFeeName
  `)
  .parameter('eventID', TYPES.Int, Number(eventID))
  .execute();

  // Process results
  return items.map(item => {
    item.profiles = item.profiles ? JSON.parse(item.profiles) : [];
    item.ceuAwardedGrants = item.ceuAwardedGrants ? JSON.parse(item.ceuAwardedGrants) : [];
    item.ceuDeclinedGrants = item.ceuDeclinedGrants ? JSON.parse(item.ceuDeclinedGrants) : [];
    
    // Format date in MM/DD/YYYY format
    if (item.activityStart) {
      item.activityStart = moment.utc(item.activityStart).format('MM/DD/YYYY');
    }
    
    return item;
  });
}

/**
 * Update registration item
 */
export async function updateRegItem(eventFeeID, data, vert) {
  const connection = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const COLUMN_TYPES = {
    activityStart: TYPES.Date,
    activityStartTime: TYPES.VarChar,
    activityEndTime: TYPES.VarChar,
    surveyID: TYPES.Int,
    checkInCode: TYPES.VarChar,
    checkOutCode: TYPES.VarChar
  };

  // Build update query
  const updateFields = Object.keys(data)
    .filter(key => key in COLUMN_TYPES)
    .map(key => `${key} = @${key}`)
    .join(', ');

  if (!updateFields) {
    throw new Error('No valid columns to update');
  }

  let updateRequest = connection.sql(`
    USE ${dbName};
    UPDATE event_fees
    SET ${updateFields}
    WHERE eventFeeID = @eventFeeID;
  `)
  .parameter('eventFeeID', TYPES.Int, Number(eventFeeID));

  // Add parameters
  for (const key in data) {
    if (key in COLUMN_TYPES) {
      updateRequest = updateRequest.parameter(key, COLUMN_TYPES[key], data[key]);
    }
  }

  await updateRequest.execute();

  return data;
}

/**
 * Get registration item by event fee ID
 */
export async function getRegItemByEventFeeID(eventFeeID, vert) {
  try {
    if (!eventFeeID) return null;

    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    let fee = await connection.sql(`
      USE ${dbName};
      SELECT 
        checkInCode,
        checkOutCode,
        customFeeName as name,
        CEUName,
        CEUValue,
        ISNULL(fee_price, 0) as price,
        excludes,
        extras,
        ISNULL(classLimit, 0) classLimit,
        (
          SELECT count (1) as SessionCount
          FROM contestant_fees cf
          INNER JOIN eventContestant ec ON cf.contestant_id = ec.contestant_id 
            and ec.regcomplete = 1
          WHERE eventFeeID = @eventFeeID
        ) as sessionCount
      FROM event_fees
      WHERE eventFeeID = @eventFeeID
    `)
    .parameter('eventFeeID', TYPES.Int, Number(eventFeeID))
    .execute()
    .then(results => results.map(fee => ({
      ...fee,
      checkInCode: fee.checkInCode || '',
      checkOutCode: fee.checkOutCode || '',
      excludes: fee.excludes ? fee.excludes.split(',') : [],
      extras: fee.extras ? fee.extras.split(',') : [],
      classLimitSpacesLeft: Number(fee.classLimit) != 0 ? Number(fee.classLimit) - Number(fee.sessionCount) : 999,
      free: fee.price == 0
    })));

    if (!fee.length) return null;
    fee = fee[0];

    fee.options = await connection.sql(`
      USE ${dbName};
      SELECT
        efto.optionID,
        efto.subClassID,
        efsc.option_name,
        ISNULL(efto.limit, 0) AS subClassLimit,
        (
          SELECT COUNT(optionID) 
          FROM contestant_fees_option cfo
          WHERE cfo.optionID = efsc.optionID
            AND cfo.eventFeeID = ef.eventFeeID
        ) AS numSubClassesFilled
      FROM event_fees ef 
      JOIN event_fee_to_options efto ON ef.eventFeeID = efto.eventFeeID AND ef.event_id = efto.event_id 
      JOIN event_fee_subClassOptions efsc ON efto.optionID = efsc.optionID
      WHERE
        ef.eventFeeID = @eventFeeID
      ORDER BY
        option_name
    `)
    .parameter('eventFeeID', TYPES.Int, Number(eventFeeID))
    .execute()
    .then(results => results.map(option => ({
      id: option.optionID,
      name: option.option_name,
      limit: option.subClassLimit,
      filled: option.numSubClassesFilled,
      subClassID: option.subClassID
    })));

    return fee;
  } catch (error) {
    console.error('Error getting registration item by event fee ID:', error);
    throw error;
  }
}

