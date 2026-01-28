/**
 * Invitations functions
 * Migrated from Mantle functions/invitations
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

/**
 * Get invitation counts
 */
export async function getInvitationCounts(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request1 = new sql.Request();
    request1.input('eventID', sql.Int, Number(eventID));
    const result1 = await request1.query(`
      USE ${dbName};
      SELECT 
          SUM(decline) as declineTotal,
          COUNT(invitee_id) as totalInvitees,
          (
              SELECT
                  COUNT(1) 
              FROM b_invitees
              WHERE event_id = @eventID and isnull(emailCount,0) > 0
          ) as totalInvited
      FROM b_invitees 
      WHERE event_id = @eventID
    `);
    const countsResults = result1.recordset;

    const request2 = new sql.Request();
    request2.input('eventID', sql.Int, Number(eventID));
    const result2 = await request2.query(`
      USE ${dbName};
      SELECT COUNT(1) as total
      FROM b_invitees i
      INNER JOIN b_users u ON i.invitee_email = u.user_email 
          AND u.user_id IN (
              SELECT user_id FROM eventContestant WHERE event_id = @eventID AND regComplete = 1
          ) 
      WHERE event_id = @eventID and ISNULL(i.decline,0) = 0
    `);
    const acceptsResults = result2.recordset;

    const counts = countsResults.length ? countsResults[0] : {};
    const accepts = acceptsResults.length ? acceptsResults[0] : {};

    const noResponseCount = (counts.totalInvited || 0) - (counts.declineTotal || 0) - (accepts.total || 0);

    return {
      listed: counts.totalInvitees || 0,
      invited: counts.totalInvited || 0,
      declines: counts.declineTotal || 0,
      accepts: accepts.total || 0,
      noResponse: noResponseCount > 0 ? noResponseCount : 0
    };
  } catch (error) {
    console.error('Error getting invitation counts:', error);
    throw error;
  }
}

/**
 * Get events with invitees by affiliate
 */
export async function getEventsWithInviteesByAffiliate(eventID, affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      SELECT DISTINCT(i.event_id), e.event_title, e.event_begins
      FROM b_invitees i
      INNER JOIN b_events e ON e.event_id = i.event_id
      WHERE e.affiliate_id = @affiliateID
          AND i.event_id <> @eventID
      ORDER BY e.event_title
    `);
    const events = result.recordset;

    return events;
  } catch (error) {
    console.error('Error getting events with invitees by affiliate:', error);
    throw error;
  }
}

/**
 * Audit invitees - clear out declines who later registered
 */
export async function auditInvitees(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    await request.query(`
      USE ${dbName};
      UPDATE b_invitees
      SET decline = null
      WHERE
          event_id = @eventID
          AND invitee_email in (
              SELECT user_email
              FROM b_users u
              INNER JOIN eventContestant ec on ec.user_id = u.user_id
              WHERE ec.event_id = @eventID and ec.regComplete = 1
          )
    `);

    return {
      message: 'Successfully audited invitees'
    };
  } catch (error) {
    console.error('Error auditing invitees:', error);
    throw error;
  }
}

/**
 * Get invitee list
 */
export async function getInviteeList(filter, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const keywordFilter = filter.keyword && filter.keyword.length
      ? `
          AND (
              invitee_firstname LIKE @keyword
              OR
              invitee_lastname LIKE @keyword
              OR
              invitee_email LIKE @keyword
              OR
              sourceName LIKE @keyword
          )
      `
      : '';

    const profileFilter = filter.profile && filter.profile.length
      ? `
          AND profileName = ${filter.profile === 'noprofile' ? `''` : `@profile`}
      `
      : '';

    let generalFilter = '';
    if (filter.generalFilter && filter.generalFilter.length) {
      if (filter.generalFilter === 'noreply') {
        generalFilter = `
            AND ISNULL(decline,0) = 0
            AND IsDate(i.lastEmailSent) = 1
            AND (
                ISNULL(ec.contestant_id,0) = 0
                OR
                (
                    ISNULL(ec.regcomplete,0) = 0
                    AND
                    ISNULL(ec.pendingDenied,0) = 0
                )
            )
        `;
      } else if (filter.generalFilter === 'uninvited') {
        generalFilter = `
            AND ISNULL(emailcount,0) = 0
            AND ISNULL(decline,0) = 0
        `;
      } else if (filter.generalFilter === 'declined') {
        generalFilter = `
            AND decline = 1
            AND ISNULL(ec.regcomplete,0) = 0
        `;
      }
    }

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(filter.eventID));

    if (filter.keyword && filter.keyword.length) {
      request.input('keyword', sql.VarChar, `%${filter.keyword}%`);
    }
    if (filter.profile && filter.profile.length && filter.profile !== 'noprofile') {
      request.input('profile', sql.VarChar, filter.profile);
    }

    const result = await request.query(`
      USE ${dbName};
      SELECT
          count(*) over() as totalCount,
          u.user_id AS user_id,
          i.invitee_id,
          ISNULL(i.failed, 0) AS failed,
          i.invitee_firstname,
          i.invitee_lastname,
          i.invitee_email,
          ISNULL(i.profileName, '') AS profileName,
          ISNULL(i.sourceName, '') AS sourceName,
          ISNULL( i.subAccountLimit, 99 ) AS subAccountLimit,
          ISNULL(i.emailCount, 0) AS emailCount,
          ISNULL(ec.regcomplete, 0) AS regComplete,
          ec.contestant_id,
          ISNULL(ec.pendingDenied, 0) AS pendingDenied,
          i.lastEmailSent,
          CASE WHEN ( u.user_id > 0 ) THEN 1 ELSE 0 END AS accept,
          ISNULL(i.decline, 0) decline,
          i.declineDate
      FROM b_invitees i
      LEFT JOIN b_users u ON i.invitee_email = u.user_email
      LEFT JOIN eventContestant ec ON ec.user_id = u.user_id
          AND ec.event_id = i.event_id
      WHERE i.event_id = @eventID
      ${keywordFilter}
      ${generalFilter}
      ${profileFilter}
      ORDER BY
          decline,
          emailCount,
          lastemailsent,
          ec.contestant_id,
          invitee_lastname
      OFFSET ${Number(filter.skip)} ROWS
      FETCH NEXT ${Number(filter.amount)} ROWS ONLY;
    `);
    const invitees = result.recordset;

    return {
      invitees,
      filteredCount: invitees.length ? invitees[0].totalCount : 0
    };
  } catch (error) {
    console.error('Error getting invitee list:', error);
    throw error;
  }
}

/**
 * Get templates
 */
export async function getTemplates(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      SELECT 
          templateText,
          templateSubject,
          recordID,
          templateAlias,
          saveToCalendar,
          hideHeader,
          hideMoreInfo,
          hideFirstName,
          hidePresentedBy,
          simpleEmail,
          includeBanner,
          saveTheDate,
          acceptButton,
          declineButton,
          calendarSaveLabel,
          moreInfoLabel,
          linkType
      FROM emailTemplates
      WHERE affiliate_id = @affiliateID
          and templateText is not null
          and eventInvite = 1
    `);
    const templates = result.recordset;

    return templates;
  } catch (error) {
    console.error('Error getting templates:', error);
    throw error;
  }
}

/**
 * Delete template
 */
export async function deleteTemplate(recordID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('recordID', sql.Int, Number(recordID));
    await request.query(`
      USE ${dbName};
      DELETE emailTemplates
      WHERE recordID = @recordID
    `);

    return {
      deletedTemplate: recordID
    };
  } catch (error) {
    console.error('Error deleting template:', error);
    throw error;
  }
}

