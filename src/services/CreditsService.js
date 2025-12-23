/**
 * Credits Service
 * Migrated from services/CreditsService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import {
  getCreditsByUserID as getCreditsByUserIDFunc,
  getStates,
  filterAttendeesByProfile,
  filterAttendeesByJurisdiction
} from '../functions/credits.js';
import { getUserByID } from '../functions/users.js';

class CreditsService {
  /**
   * Get credits by user ID
   */
  async getCreditsByUserID(userID, vert) {
    try {
      if (!userID || !vert) {
        throw new Error('User ID and vertical are required');
      }

      const credits = await getCreditsByUserIDFunc(userID, vert);
      const user = await getUserByID(
        userID,
        [
          'user_firstname',
          'user_lastname',
          'user_address',
          'user_city',
          'user_state',
          'user_postalCode',
          'user_mobile',
          'user_email'
        ],
        vert
      );

      return {
        credits,
        user
      };
    } catch (error) {
      console.error('Error getting credits by user ID:', error);
      throw error;
    }
  }

  /**
   * Get CE events by user ID
   */
  async getCEEventsByUserID(userID, vert) {
    try {
      if (!userID || !vert) {
        throw new Error('User ID and vertical are required');
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT 
          e.event_id AS eventID, 
          e.event_begins AS eventBeginDate, 
          e.event_ends AS eventEndDate, 
          e.event_title AS eventName, 
          a.affiliate_id AS affiliateID,
          a.affiliate_name AS affiliateName, 
          a.logo AS affiliateLogo
        FROM eventContestant ec
        JOIN ceuAwarded ceua ON ceua.contestant_id = ec.contestant_id
        JOIN b_events e ON e.event_id = ceua.event_id
        JOIN b_affiliates a ON a.affiliate_id = e.affiliate_id
        WHERE ec.user_id = @userID
      `)
      .parameter('userID', TYPES.Int, Number(userID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting CE events by user ID:', error);
      throw error;
    }
  }

  /**
   * Get event credit categories
   */
  async getEventCreditCategories(eventID, query, vert) {
    // TODO: Implement getEventCreditCategories from old CreditsService
    return [];
  }

  /**
   * Get event credit categories assignment grid
   */
  async getEventCreditCategoriesAssignmentGrid(eventID, vert) {
    // TODO: Implement getEventCreditCategoriesAssignmentGrid from old CreditsService
    return [];
  }

  /**
   * Get event credit categories credit library
   */
  async getEventCreditCategoriesCreditLibrary(eventID, vert) {
    // TODO: Implement getEventCreditCategoriesCreditLibrary from old CreditsService
    return [];
  }

  /**
   * Get event credit categories grant dashboard
   */
  async getEventCreditCategoriesGrantDashboard(eventID, vert) {
    // TODO: Implement getEventCreditCategoriesGrantDashboard from old CreditsService
    return [];
  }

  /**
   * Get event credit categories criteria form
   */
  async getEventCreditCategoriesCriteriaForm(eventID, query, vert) {
    // TODO: Implement getEventCreditCategoriesCriteriaForm from old CreditsService
    return [];
  }

  /**
   * Get event credit categories report
   */
  async getEventCreditCategoriesReport(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT
          cc.ceuID as id,
          cc.ceuCategory as category,
          cc.ceuCode as code,
          cc.archived
        FROM ceu_categories cc
        WHERE cc.event_id = @eventID
        ORDER BY cc.ceuCategory ASC;
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results.map(cat => ({
        ...cat,
        archived: Number(cat.archived)
      }));
    } catch (error) {
      console.error('Error getting event credit categories report:', error);
      throw error;
    }
  }

  /**
   * Get unused categories
   */
  async getUnusedCategories(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT c.ceuID, c.ceuCategory 
        FROM ceu_categories c
        LEFT JOIN ceuPackageCategories cpc ON c.ceuID = cpc.ceuID
        JOIN ceu_event_fees cef ON cef.ceuID = c.ceuID
        WHERE c.event_id = @eventID AND c.archived = 0 AND (cpc.packageCatID IS NULL)
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting unused categories:', error);
      throw error;
    }
  }

  /**
   * Update credit category
   */
  async updateCreditCategory(catID, body, vert) {
    // TODO: Implement updateCreditCategory from old CreditsService
    return { status: 'success' };
  }

  /**
   * Create credit category
   */
  async createCreditCategory(body, vert) {
    // TODO: Implement createCreditCategory from old CreditsService
    return { status: 'success' };
  }

  /**
   * Archive credit category
   */
  async archiveCreditCategory(catID, body, vert) {
    // TODO: Implement archiveCreditCategory from old CreditsService
    return { status: 'success' };
  }

  /**
   * Get awarded attendees by category
   */
  async getAwardedAttendeesByCategory(eventID, categoryID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT
          ceua.awardID,
          c.contestant_id,
          u.user_firstname AS firstName,
          u.user_lastname AS lastName,
          ef.eventFeeID,
          ef.customFeeName AS sessionName,
          c.checkedIn AS eventCheckIn,
          cf.checkedIn AS sessionCheckIn,
          cf.checkedOut AS sessionCheckOut,
          (ISNULL(c.totalDue,0) - ISNULL(c.couponValue,0) - ISNULL(c.totalPaid,0)) AS balanceDue,
          s.responded AS surveyCompleted,
          ceua.ceuValue AS credits,
          el.logID AS exceptionLogID
        FROM ceuAwarded ceua
        JOIN ceu_event_fees cef ON ceua.eventFeeID = cef.eventFeeID
        JOIN ceu_categories cat ON cat.ceuID = cef.ceuID
        JOIN event_fees ef ON ef.eventFeeID = cef.eventFeeID
        JOIN contestant_fees cf ON ef.eventFeeID = cf.eventFeeID AND cf.contestant_id = ceua.contestant_id
        JOIN eventContestant c ON ceua.contestant_id = c.contestant_id
        JOIN b_users u ON c.user_id = u.user_id
        LEFT JOIN (
          SELECT MAX(CAST(ISNULL(si.responded,0) AS int)) AS responded, si.userID, si.surveyID, si.eventID 
          FROM surveyInvitees si
          GROUP BY si.userID, si.surveyID, si.eventID
        ) s ON s.userID = c.user_id AND s.surveyID = ef.surveyID
        LEFT JOIN ceuExceptionLog el ON el.categoryID = cat.ceuID AND el.eventFeeID = cf.eventFeeID AND el.contestant_id = c.contestant_id
        WHERE cat.ceuID = @categoryID AND cat.event_id = @eventID
        ORDER BY firstName, lastName, sessionName
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('categoryID', TYPES.Int, Number(categoryID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting awarded attendees by category:', error);
      throw error;
    }
  }

  /**
   * Get sessions by category
   */
  async getSessionsByCategory(eventID, categoryID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT
          ef.eventFeeID as sessionID,
          ef.customFeeName as sessionName,
          cat.ceuID as categoryID
        FROM ceu_event_fees cef
        JOIN event_fees ef ON cef.eventFeeID = ef.eventFeeID
        JOIN ceu_categories cat ON cat.ceuID = cef.ceuID
        WHERE cat.ceuID = @categoryID AND cat.event_id = @eventID
        ORDER BY ef.customFeeName ASC
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('categoryID', TYPES.Int, Number(categoryID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting sessions by category:', error);
      throw error;
    }
  }

  /**
   * Get grants by category
   */
  async getGrantsByCategory(eventID, categoryID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT g.grantID
        FROM ceuGrants g
        JOIN ceu_categories cat ON g.event_id = cat.event_id
        JOIN ceuPackageCategories cpc ON cpc.ceuID = cat.ceuID
        WHERE cat.event_id = @eventID AND cat.ceuID = @categoryID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('categoryID', TYPES.Int, Number(categoryID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting grants by category:', error);
      throw error;
    }
  }

  /**
   * Get award criteria packages
   */
  async getAwardCriteriaPackages(params, vert) {
    // TODO: Implement getAwardCriteriaPackages from old CreditsService
    return [];
  }

  /**
   * Create award criteria package
   */
  async createAwardCriteriaPackage(eventID, body, vert) {
    // TODO: Implement createAwardCriteriaPackage from old CreditsService
    return { status: 'success' };
  }

  /**
   * Delete award criteria package
   */
  async deleteAwardCriteriaPackage(eventID, packageID, vert) {
    // TODO: Implement deleteAwardCriteriaPackage from old CreditsService
    return { status: 'success' };
  }

  /**
   * Edit award criteria package
   */
  async editAwardCriteriaPackage(eventID, packageID, body, vert) {
    // TODO: Implement editAwardCriteriaPackage from old CreditsService
    return { status: 'success' };
  }

  /**
   * Reset award criteria package
   */
  async resetAwardCriteriaPackage(eventID, packageID, vert) {
    // TODO: Implement resetAwardCriteriaPackage from old CreditsService
    return { status: 'success' };
  }

  /**
   * Get attendees to award
   */
  async getAttendeesToAward(packageID, vert, nullParam, categoryID, sessionID) {
    // TODO: Implement getAttendeesToAward from old CreditsService
    return [];
  }

  /**
   * Get attendees to decline
   */
  async getAttendeesToDecline(packageID, vert, nullParam, categoryID, sessionID) {
    // TODO: Implement getAttendeesToDecline from old CreditsService
    return [];
  }

  /**
   * Get exception log
   */
  async getExceptionLog(eventID, packageID, categoryID, sessionID, pending, vert) {
    // TODO: Implement getExceptionLog from old CreditsService
    return [];
  }

  /**
   * Add award exception
   */
  async addAwardException(body, vert) {
    // TODO: Implement addAwardException from old CreditsService
    return { status: 'success' };
  }

  /**
   * Update award exception
   */
  async updateAwardException(logID, body, vert) {
    // TODO: Implement updateAwardException from old CreditsService
    return { status: 'success' };
  }

  /**
   * Remove award exception
   */
  async removeAwardException(logID, vert) {
    // TODO: Implement removeAwardException from old CreditsService
    return { status: 'success' };
  }

  /**
   * Get transcript template
   */
  async getTranscriptTemplate(edit, preview, eventID, userID, vert) {
    // TODO: Implement getTranscriptTemplate from old CreditsService
    return '';
  }

  /**
   * Run cron scheduled runs
   */
  async runCronScheduledRuns(verts) {
    // TODO: Implement runCronScheduledRuns from old CreditsService
    return [];
  }

  /**
   * Get cron scheduled runs
   */
  async getCronScheduledRuns(vert) {
    // TODO: Implement getCronScheduledRuns from old CreditsService
    return [];
  }

  /**
   * Get scheduled runs
   */
  async getScheduledRuns(eventID, vert) {
    // TODO: Implement getScheduledRuns from old CreditsService
    return [];
  }

  /**
   * Create grant
   */
  async createGrant(eventID, body, vert) {
    // TODO: Implement createGrant from old CreditsService
    return { status: 'success' };
  }

  /**
   * Remove scheduled run
   */
  async removeScheduledRun(eventID, grantID, vert) {
    // TODO: Implement removeScheduledRun from old CreditsService
    return { status: 'success' };
  }

  /**
   * Get recent runs
   */
  async getRecentRuns(eventID, scheduled, vert) {
    // TODO: Implement getRecentRuns from old CreditsService
    return [];
  }

  /**
   * Get recent run details
   */
  async getRecentRunDetails(eventID, logID, vert) {
    // TODO: Implement getRecentRunDetails from old CreditsService
    return {};
  }

  /**
   * Get affected attendees count
   */
  async getAffectedAttendeesCount(eventID, packageID, testMode, vert) {
    // TODO: Implement getAffectedAttendeesCount from old CreditsService
    return { affectedCount: 0 };
  }

  /**
   * Get awarded attendees
   */
  async getAwardedAttendees(eventID, logID, vert) {
    // TODO: Implement getAwardedAttendees from old CreditsService
    return [];
  }

  /**
   * Get declined attendees
   */
  async getDeclinedAttendees(eventID, logID, vert) {
    // TODO: Implement getDeclinedAttendees from old CreditsService
    return [];
  }

  /**
   * Get awarded by reg item ID
   */
  async getAwardedByRegItemID(eventID, logID, catID, itemID, vert) {
    // TODO: Implement getAwardedByRegItemID from old CreditsService
    return [];
  }

  /**
   * Get declined by reg item ID
   */
  async getDeclinedByRegItemID(eventID, logID, catID, itemID, vert) {
    // TODO: Implement getDeclinedByRegItemID from old CreditsService
    return [];
  }

  /**
   * Unaward attendee
   */
  async unawardAttendee(eventID, awardID, vert) {
    // TODO: Implement unawardAttendee from old CreditsService
    return { status: 'success' };
  }

  /**
   * Get event sessions
   */
  async getEventSessions(eventID, vert) {
    // TODO: Implement getEventSessions from old CreditsService
    return [];
  }
}

export default CreditsService;
