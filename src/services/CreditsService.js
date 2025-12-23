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
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT
          cc.ceuID as id,
          cc.ceuCategory as category,
          cc.ceuCode as code,
          cc.ceuDescription as description,
          cc.archived,
          (
            SELECT stateID
            FROM ceu_jurisdictions cj
            WHERE cj.ceuID = cc.ceuID
            FOR JSON PATH
          ) as jurisdictions,
          (
            SELECT cp.bundle_id AS id
            FROM ceu_profiles cp
            LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
            WHERE cp.ceuID = cc.ceuID
            FOR JSON PATH
          ) AS profiles,
          (
            SELECT DISTINCT u.user_id, ec.bundle_id AS profileID, u.user_state AS userState
            FROM b_users u
            JOIN eventContestant ec ON ec.user_id = u.user_id
            JOIN contestant_fees cf ON cf.contestant_id = ec.contestant_id
            JOIN ceu_event_fees cef ON cef.eventFeeID = cf.eventFeeID
            WHERE cef.ceuID = cc.ceuID AND ec.regComplete = 1 AND (ec.fullscratch IS NULL OR ec.fullscratch = 0) AND (cf.scratchClass IS NULL OR cf.scratchClass = 0)
            FOR JSON PATH
          ) AS totalAttendees,
          (
            SELECT
            (
              SELECT user_id, ceuCategory, ceuID, profileID, userState
              FROM
                (
                  SELECT DISTINCT u.user_id, ec.bundle_id AS profileID, u.user_state AS userState
                  FROM b_users u
                  JOIN eventContestant ec ON ec.user_id = u.user_id
                  JOIN contestant_fees cf ON cf.contestant_id = ec.contestant_id
                  JOIN ceu_event_fees cef ON cef.eventFeeID = cf.eventFeeID
                  JOIN ceuAwarded ceua ON ceua.eventFeeID = cf.eventFeeID AND ceua.categoryID = cc.ceuID
                  WHERE cef.ceuID = cc.ceuID AND ec.contestant_id = ceua.contestant_id
                  UNION
                  SELECT DISTINCT u.user_id, ec.bundle_id AS profileID, u.user_state AS userState
                  FROM b_users u
                  JOIN eventContestant ec ON ec.user_id = u.user_id
                  JOIN contestant_fees cf ON cf.contestant_id = ec.contestant_id
                  JOIN ceu_event_fees cef ON cef.eventFeeID = cf.eventFeeID
                  JOIN ceuDeclined ceud ON ceud.eventFeeID = cf.eventFeeID AND ceud.categoryID = cc.ceuID
                  WHERE cef.ceuID = cc.ceuID AND ec.contestant_id = ceud.contestant_id
                ) x
              FOR JSON PATH
            )
          ) AS processedAttendees,
          (
            SELECT COUNT(DISTINCT cea.contestant_id)
            FROM ceuAwarded cea
            JOIN ceu_event_fees cef ON cea.eventFeeID = cef.eventFeeID
            WHERE cef.ceuID = cc.ceuID
          ) as awardedCount,
          (
            SELECT TOP 1 p.packageID
            FROM ceuPackages p
            JOIN ceuPackageCategories pc ON pc.packageID = p.packageID
            WHERE pc.ceuID = cc.ceuID
          ) as packageID,
          (
            SELECT MAX(runDate)
            FROM ceuGrantLog gl
            JOIN ceuGrants g ON g.grantID = gl.grantID
            JOIN ceuPackageCategories cpc ON cpc.packageID = g.packageID
            JOIN ceu_categories cat ON cat.ceuID = cpc.ceuID
            WHERE cat.ceuID = cc.ceuID
          ) as lastRun,
          (
            SELECT COUNT(DISTINCT g.grantID)
            FROM ceuGrants g
            JOIN ceu_categories cat ON g.event_id = cat.event_id
            JOIN ceuPackageCategories cpc ON cpc.ceuID = cat.ceuID
            WHERE cat.ceuID = cc.ceuID
          ) as grantCount
        FROM ceu_categories cc
        ${'sessions' in query ? `JOIN ceu_event_fees cef ON cef.ceuID = cc.ceuID` : ''}
        WHERE cc.event_id = @eventID
        ORDER BY cc.ceuCategory ASC;
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results.map(cat => {
        // Format Data
        cat.jurisdictions = cat.jurisdictions ? JSON.parse(cat.jurisdictions) : [];
        cat.profiles = cat.profiles ? JSON.parse(cat.profiles) : [];
        cat.totalAttendees = cat.totalAttendees ? JSON.parse(cat.totalAttendees) : [];
        cat.processedAttendees = cat.processedAttendees ? JSON.parse(cat.processedAttendees) : [];
        cat.archived = Number(cat.archived);

        // Get the states
        cat.jurisdictions = cat.jurisdictions.map(jur => jur.stateID);
        cat.jurisdictions = states.filter(state => cat.jurisdictions.includes(state.id));

        // Filter attendees by profile and jurisdiction
        cat.totalAttendees = filterAttendeesByProfile(cat.totalAttendees, cat.profiles);
        if (cat.totalAttendees.length) {
          cat.totalAttendees = filterAttendeesByJurisdiction(cat.totalAttendees, cat.jurisdictions);
        }
        cat.totalAttendeesCount = cat.totalAttendees.length;

        cat.processedAttendees = filterAttendeesByProfile(cat.processedAttendees, cat.profiles);
        if (cat.processedAttendees.length) {
          cat.processedAttendees = filterAttendeesByJurisdiction(cat.processedAttendees, cat.jurisdictions);
        }
        cat.processedAttendeesCount = cat.processedAttendees.length;

        return cat;
      });
    } catch (error) {
      console.error('Error getting event credit categories:', error);
      throw error;
    }
  }

  /**
   * Get event credit categories assignment grid
   */
  async getEventCreditCategoriesAssignmentGrid(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT
          cc.ceuID as id,
          cc.ceuCategory as category,
          cc.ceuCode as code,
          cc.archived,
          (
            SELECT
              efb.bundle_name as name,
              cp.bundle_id as id
            FROM ceu_profiles cp
            LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
            WHERE cp.ceuID = cc.ceuID
            FOR JSON PATH
          ) as profiles
        FROM ceu_categories cc
        WHERE cc.event_id = @eventID
        ORDER BY cc.ceuCategory ASC;
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results.map(cat => {
        cat.profiles = cat.profiles ? JSON.parse(cat.profiles) : [];
        cat.archived = Number(cat.archived);
        return cat;
      });
    } catch (error) {
      console.error('Error getting event credit categories assignment grid:', error);
      throw error;
    }
  }

  /**
   * Get event credit categories credit library
   */
  async getEventCreditCategoriesCreditLibrary(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT
          cc.ceuID as id,
          cc.ceuCategory as category,
          cc.ceuCode as code,
          cc.ceuDescription as description,
          cc.archived,
          (
            SELECT stateID
            FROM ceu_jurisdictions cj
            WHERE cj.ceuID = cc.ceuID
            FOR JSON PATH
          ) as jurisdictions,
          (
            SELECT
              efb.bundle_name as name,
              cp.bundle_id as id
            FROM ceu_profiles cp
            LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
            WHERE cp.ceuID = cc.ceuID
            FOR JSON PATH
          ) as profiles
        FROM ceu_categories cc
        WHERE cc.event_id = @eventID
        ORDER BY cc.ceuCategory ASC;
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results.map(cat => {
        // Format Data
        cat.profiles = cat.profiles ? JSON.parse(cat.profiles) : [];
        cat.jurisdictions = cat.jurisdictions ? JSON.parse(cat.jurisdictions) : [];
        cat.archived = Number(cat.archived);

        // Get the states
        cat.jurisdictions = cat.jurisdictions.map(jur => jur.stateID);
        cat.jurisdictions = states.filter(state => cat.jurisdictions.includes(state.id));

        return cat;
      });
    } catch (error) {
      console.error('Error getting event credit categories credit library:', error);
      throw error;
    }
  }

  /**
   * Get event credit categories grant dashboard
   */
  async getEventCreditCategoriesGrantDashboard(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT
          cc.ceuID AS id,
          cc.ceuCategory AS category,
          cc.ceuCode AS code,
          cc.archived,
          (
            SELECT stateID
            FROM ceu_jurisdictions cj
            WHERE cj.ceuID = cc.ceuID
            FOR JSON PATH
          ) AS jurisdictions,
          (
            SELECT cp.bundle_id AS id
            FROM ceu_profiles cp
            LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
            WHERE cp.ceuID = cc.ceuID
            FOR JSON PATH
          ) AS profiles,
          (
            SELECT DISTINCT u.user_id, ec.bundle_id AS profileID, u.user_state AS userState
            FROM b_users u
            JOIN eventContestant ec ON ec.user_id = u.user_id
            JOIN contestant_fees cf ON cf.contestant_id = ec.contestant_id
            JOIN ceu_event_fees cef ON cef.eventFeeID = cf.eventFeeID
            WHERE cef.ceuID = cc.ceuID AND ec.regComplete = 1 AND (ec.fullscratch IS NULL OR ec.fullscratch = 0) AND (cf.scratchClass IS NULL OR cf.scratchClass = 0)
            FOR JSON PATH
          ) AS totalAttendees,
          (
            SELECT
            (
              SELECT user_id, ceuCategory, ceuID, profileID, userState
              FROM
                (
                  SELECT DISTINCT u.user_id, ec.bundle_id AS profileID, u.user_state AS userState
                  FROM b_users u
                  JOIN eventContestant ec ON ec.user_id = u.user_id
                  JOIN contestant_fees cf ON cf.contestant_id = ec.contestant_id
                  JOIN ceu_event_fees cef ON cef.eventFeeID = cf.eventFeeID
                  JOIN ceuAwarded ceua ON ceua.eventFeeID = cf.eventFeeID AND ceua.categoryID = cc.ceuID
                  WHERE cef.ceuID = cc.ceuID AND ec.contestant_id = ceua.contestant_id
                  UNION
                  SELECT DISTINCT u.user_id, ec.bundle_id AS profileID, u.user_state AS userState
                  FROM b_users u
                  JOIN eventContestant ec ON ec.user_id = u.user_id
                  JOIN contestant_fees cf ON cf.contestant_id = ec.contestant_id
                  JOIN ceu_event_fees cef ON cef.eventFeeID = cf.eventFeeID
                  JOIN ceuDeclined ceud ON ceud.eventFeeID = cf.eventFeeID AND ceud.categoryID = cc.ceuID
                  WHERE cef.ceuID = cc.ceuID AND ec.contestant_id = ceud.contestant_id
                ) x
              FOR JSON PATH
            )
          ) AS processedAttendees,
          (
            SELECT TOP 1 p.packageID
            FROM ceuPackages p
            JOIN ceuPackageCategories pc ON pc.packageID = p.packageID
            WHERE pc.ceuID = cc.ceuID
          ) AS packageID,
          (
            SELECT MAX(runDate)
            FROM ceuGrantLog gl
            JOIN ceuGrants g ON g.grantID = gl.grantID
            JOIN ceuPackageCategories cpc ON cpc.packageID = g.packageID
            JOIN ceu_categories cat ON cat.ceuID = cpc.ceuID
            WHERE cat.ceuID = cc.ceuID
          ) AS lastRun
        FROM ceu_categories cc
        WHERE cc.event_id = @eventID
        ORDER BY cc.ceuCategory ASC;
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results.map(cat => {
        cat.profiles = cat.profiles ? JSON.parse(cat.profiles) : [];
        cat.jurisdictions = cat.jurisdictions ? JSON.parse(cat.jurisdictions) : [];
        cat.totalAttendees = cat.totalAttendees ? JSON.parse(cat.totalAttendees) : [];
        cat.processedAttendees = cat.processedAttendees ? JSON.parse(cat.processedAttendees) : [];
        cat.archived = Number(cat.archived);

        // Get the states
        cat.jurisdictions = cat.jurisdictions.map(jur => jur.stateID);
        cat.jurisdictions = states.filter(state => cat.jurisdictions.includes(state.id));

        // Filter attendees by profile and jurisdiction
        cat.totalAttendees = filterAttendeesByProfile(cat.totalAttendees, cat.profiles);
        if (cat.totalAttendees.length) {
          cat.totalAttendees = filterAttendeesByJurisdiction(cat.totalAttendees, cat.jurisdictions);
        }
        cat.totalAttendeesCount = cat.totalAttendees.length;

        cat.processedAttendees = filterAttendeesByProfile(cat.processedAttendees, cat.profiles);
        if (cat.processedAttendees.length) {
          cat.processedAttendees = filterAttendeesByJurisdiction(cat.processedAttendees, cat.jurisdictions);
        }
        cat.processedAttendeesCount = cat.processedAttendees.length;

        return cat;
      });
    } catch (error) {
      console.error('Error getting event credit categories grant dashboard:', error);
      throw error;
    }
  }

  /**
   * Get event credit categories criteria form
   */
  async getEventCreditCategoriesCriteriaForm(eventID, query, vert) {
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
        ${'sessions' in query ? `JOIN ceu_event_fees cef ON cef.ceuID = cc.ceuID` : ''}
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
      console.error('Error getting event credit categories criteria form:', error);
      throw error;
    }
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
   * Save category profiles (helper)
   */
  async saveCategoryProfiles(profiles, ceuID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      if (!profiles || !profiles.length) return;

      const values = profiles.map((profile, i) => `(@profileID${i}, @ceuID)`).join(',');
      let request = connection.sql(`
        USE ${dbName};
        INSERT INTO ceu_profiles (bundle_id, ceuID) VALUES ${values};
      `)
      .parameter('ceuID', TYPES.Int, Number(ceuID));

      profiles.forEach((profile, i) => {
        request.parameter(`profileID${i}`, TYPES.Int, profile);
      });

      return await request.execute();
    } catch (error) {
      console.error('Error saving category profiles:', error);
      throw error;
    }
  }

  /**
   * Save category states (helper)
   */
  async saveCategoryStates(states, ceuID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      if (!states || !states.length) return;

      const values = states.map((state, i) => `(@stateID${i}, @ceuID)`).join(',');
      let request = connection.sql(`
        USE ${dbName};
        INSERT INTO ceu_jurisdictions (stateID, ceuID) VALUES ${values};
      `)
      .parameter('ceuID', TYPES.Int, Number(ceuID));

      states.forEach((state, i) => {
        request.parameter(`stateID${i}`, TYPES.Int, state);
      });

      return await request.execute();
    } catch (error) {
      console.error('Error saving category states:', error);
      throw error;
    }
  }

  /**
   * Check duplicate name/code combo (helper)
   */
  async checkDuplicateNameCodeCombo(name, code, eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT *
        FROM ceu_categories
        WHERE ceuCategory = @name
          AND ceuCode = @code
          AND event_id = @eventID
      `)
      .parameter('name', TYPES.VarChar, name)
      .parameter('code', TYPES.VarChar, code)
      .parameter('eventID', TYPES.Int, eventID)
      .execute();

      return results;
    } catch (error) {
      console.error('Error checking duplicate name/code combo:', error);
      throw error;
    }
  }

  /**
   * Update credit category
   */
  async updateCreditCategory(catID, body, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const matches = await this.checkDuplicateNameCodeCombo(
        body.name,
        body.code,
        body.eventID,
        vert
      );

      const filteredMatches = matches.filter(match => match.ceuID !== catID);

      if (filteredMatches.length) {
        return {
          updated: null,
          success: false,
          message: 'A category already exists with that name/code combo.'
        };
      }

      // Clean out existing linked records
      await connection.sql(`
        USE ${dbName};
        DELETE FROM ceu_profiles WHERE ceuID = @ceuID;
        DELETE FROM ceu_jurisdictions WHERE ceuID = @ceuID;
      `)
      .parameter('ceuID', TYPES.Int, Number(catID))
      .execute();

      // Update record
      await connection.sql(`
        USE ${dbName};
        UPDATE ceu_categories
        SET
          ceuCategory = @name,
          ceuDescription = @description,
          ceuCode = @code
        WHERE ceuID = @ceuID;
      `)
      .parameter('ceuID', TYPES.Int, Number(catID))
      .parameter('name', TYPES.VarChar, body.name)
      .parameter('description', TYPES.VarChar, body.description || '')
      .parameter('code', TYPES.VarChar, body.code)
      .execute();

      // Re-build linkages
      if (body.profiles && body.profiles.length) {
        await this.saveCategoryProfiles(body.profiles, catID, vert);
      }
      if (body.jurisdictions && body.jurisdictions.length) {
        await this.saveCategoryStates(body.jurisdictions, catID, vert);
      }

      return {
        success: true,
        updated: { ceuID: catID, ...body, archived: 0 }
      };
    } catch (error) {
      console.error('Error updating credit category:', error);
      throw error;
    }
  }

  /**
   * Create credit category
   */
  async createCreditCategory(body, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const matches = await this.checkDuplicateNameCodeCombo(
        body.name,
        body.code,
        body.eventID,
        vert
      );

      if (matches.length) {
        return {
          created: null,
          success: false,
          message: 'A category already exists with that name/code combo.'
        };
      }

      // Insert record and get new ID
      const newIDResult = await connection.sql(`
        USE ${dbName};
        INSERT INTO ceu_categories (
          ceuCategory,
          ceuDescription,
          ceuCode,
          event_id
        ) VALUES (
          @name,
          @description,
          @code,
          @eventID
        );
        SELECT SCOPE_IDENTITY() as id;
      `)
      .parameter('name', TYPES.VarChar, body.name)
      .parameter('description', TYPES.VarChar, body.description || '')
      .parameter('code', TYPES.VarChar, body.code)
      .parameter('eventID', TYPES.Int, Number(body.eventID))
      .execute();

      const newID = newIDResult[0]?.id;

      // Build linkages
      if (body.profiles && body.profiles.length) {
        await this.saveCategoryProfiles(body.profiles, newID, vert);
      }
      if (body.jurisdictions && body.jurisdictions.length) {
        await this.saveCategoryStates(body.jurisdictions, newID, vert);
      }

      return {
        success: true,
        created: { ceuID: newID, ...body, archived: 0 }
      };
    } catch (error) {
      console.error('Error creating credit category:', error);
      throw error;
    }
  }

  /**
   * Check if category is assigned to reg item (helper)
   */
  async checkCatAssignedToRegItem(catID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT *
        FROM ceu_event_fees
        WHERE ceuID = @ceuID;
      `)
      .parameter('ceuID', TYPES.Int, Number(catID))
      .execute();

      return results.length > 0;
    } catch (error) {
      console.error('Error checking if category assigned to reg item:', error);
      throw error;
    }
  }

  /**
   * Archive credit category
   */
  async archiveCreditCategory(catID, body, vert) {
    try {
      const regItemPresent = await this.checkCatAssignedToRegItem(catID, vert);
      if (regItemPresent) {
        return {
          success: false,
          errorMessage: 'This Credit Category is assigned to one or more registration items. You will need to remove it through the Credit Assignment Grid before you can archive it.'
        };
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const archiveCat = body.archived ? 0 : 1;

      await connection.sql(`
        USE ${dbName};
        UPDATE ceu_categories
        SET archived = @archived
        WHERE ceuID = @ceuID;
      `)
      .parameter('ceuID', TYPES.Int, Number(catID))
      .parameter('archived', TYPES.Int, Number(archiveCat))
      .execute();

      return {
        success: true,
        updated: { ceuID: catID, archived: archiveCat }
      };
    } catch (error) {
      console.error('Error archiving credit category:', error);
      throw error;
    }
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
   * Check category in use (helper)
   */
  async checkCategoryInUse(eventID, categories, vert, packageID = null) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Loop through categories and check if they are in use
      let inUse = false;
      for (let i = 0; i < categories.length; i++) {
        const catID = categories[i];
        let request = connection.sql(`
          USE ${dbName};
          SELECT DISTINCT c.ceuID, c.ceuCategory 
          FROM ceu_categories c
          JOIN ceuPackageCategories cpc ON c.ceuID = cpc.ceuID
          JOIN ceuPackages p ON cpc.packageID = p.packageID
          WHERE c.event_id = @eventID AND cpc.ceuID = @catID ${packageID ? 'AND NOT p.packageID = @packageID' : ''}
        `)
        .parameter('eventID', TYPES.Int, Number(eventID))
        .parameter('catID', TYPES.Int, Number(catID));

        if (packageID) {
          request.parameter('packageID', TYPES.Int, Number(packageID));
        }

        const result = await request.execute();

        if (result && result.length > 0) {
          inUse = true;
          break;
        }
      }

      return inUse;
    } catch (error) {
      console.error('Error checking category in use:', error);
      throw error;
    }
  }

  /**
   * Get last run grant (helper)
   */
  async getLastRunGrant(packageID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT TOP 1 gl.grantID, gl.runDate
        FROM ceuGrantLog gl
        JOIN ceuGrants g ON g.grantID = gl.grantID
        WHERE g.packageID = @packageID
        ORDER BY gl.runDate DESC
      `)
      .parameter('packageID', TYPES.Int, Number(packageID))
      .execute();

      return results.length ? results[0] : null;
    } catch (error) {
      console.error('Error getting last run grant:', error);
      throw error;
    }
  }

  /**
   * Save package CE links (helper)
   */
  async savePackageCELinks(packageID, categories, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      if (!categories || !categories.length) return;

      const statements = categories.map((id, i) => `
        INSERT INTO ceuPackageCategories (packageID, ceuID) VALUES (@packageID, @ceuID${i});
      `).join('');

      let request = connection.sql(`
        USE ${dbName};
        ${statements}
      `)
      .parameter('packageID', TYPES.Int, packageID);

      categories.forEach((categoryID, i) => {
        request.parameter(`ceuID${i}`, TYPES.Int, categoryID);
      });

      return await request.execute();
    } catch (error) {
      console.error('Error saving package CE links:', error);
      throw error;
    }
  }

  /**
   * Get award criteria packages
   */
  async getAwardCriteriaPackages(params, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      let sqlQuery = `
        USE ${dbName};
        SELECT
          cp.packageID,
          cp.event_id,
          cp.packageName,
          cp.attendanceCriteria,
          cp.paidInFullRequired,
          cp.surveyRequired,
          cc.ceuID,
          cc.ceuCategory,
          cc.ceuCode,
          cc.ceuDescription,
          cc.archived,
          COUNT(g.grantID) AS grantCount
        FROM ceuPackages cp
        LEFT JOIN ceuPackageCategories cpc ON cpc.packageID = cp.packageID
        LEFT JOIN ceu_categories cc ON cc.ceuID = cpc.ceuID
        LEFT JOIN ceuGrants g ON cp.packageID = g.packageID
        WHERE 1 = 1
      `;

      let request = connection.sql(sqlQuery);

      if ('eventID' in params) {
        sqlQuery += ' AND cp.event_id = @eventID';
        request = connection.sql(sqlQuery + `
          GROUP BY cp.packageID, cp.event_id, cp.packageName, cp.attendanceCriteria, cp.paidInFullRequired, cp.surveyRequired, cc.ceuID, cc.ceuCategory, cc.ceuCode, cc.ceuDescription, cc.archived
        `);
        request.parameter('eventID', TYPES.Int, Number(params.eventID));
      }

      if ('packageID' in params) {
        sqlQuery += ' AND cp.packageID = @packageID';
        request = connection.sql(sqlQuery + `
          GROUP BY cp.packageID, cp.event_id, cp.packageName, cp.attendanceCriteria, cp.paidInFullRequired, cp.surveyRequired, cc.ceuID, cc.ceuCategory, cc.ceuCode, cc.ceuDescription, cc.archived
        `);
        request.parameter('packageID', TYPES.Int, Number(params.packageID));
      }

      if (!('eventID' in params) && !('packageID' in params)) {
        request = connection.sql(sqlQuery + `
          GROUP BY cp.packageID, cp.event_id, cp.packageName, cp.attendanceCriteria, cp.paidInFullRequired, cp.surveyRequired, cc.ceuID, cc.ceuCategory, cc.ceuCode, cc.ceuDescription, cc.archived
        `);
      }

      const data = await request.execute();

      const anticipatedAwards = ('packageID' in params) ? await this.getAttendeesToAward(params.packageID, vert, {}, null, null) : [];
      const anticipatedDeclines = ('packageID' in params) ? await this.getAttendeesToDecline(params.packageID, vert, {}, null, null) : [];
      const lastRunGrant = ('packageID' in params) ? await this.getLastRunGrant(params.packageID, vert) : null;

      const ceMappings = data.reduce((acc, curr) => {
        if (!(curr.packageID in acc)) {
          acc[curr.packageID] = {
            packageID: curr.packageID,
            event_id: curr.event_id,
            packageName: curr.packageName,
            attendanceCriteria: Number(curr.attendanceCriteria),
            paidInFullRequired: Number(curr.paidInFullRequired),
            surveyRequired: Number(curr.surveyRequired),
            categories: data.filter(item => item.packageID === curr.packageID && item.ceuID).map(record => ({
              ceuID: record.ceuID,
              ceuCategory: record.ceuCategory,
              ceuCode: record.ceuCode,
              ceuDescription: record.ceuDescription,
              archived: record.archived
            })),
            associatedGrantsCount: curr.grantCount,
            anticipatedAwards: anticipatedAwards,
            anticipatedDeclines: anticipatedDeclines,
            lastRunGrant: lastRunGrant
          };
        }
        return acc;
      }, {});

      return Object.values(ceMappings);
    } catch (error) {
      console.error('Error getting award criteria packages:', error);
      return [];
    }
  }

  /**
   * Create award criteria package
   */
  async createAwardCriteriaPackage(eventID, body, vert) {
    try {
      const { packageName, attendanceCriteria, paidInFullRequired, surveyRequired, categories } = body;

      if (!categories || !categories.length) {
        return { success: false, message: 'Package must apply to at least one Credit Category' };
      }

      if (await this.checkCategoryInUse(eventID, categories, vert)) {
        return { success: false, message: 'Package cannot apply to a Credit Category that is already in use' };
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Create new package and get new ID
      const newPackageIDResult = await connection.sql(`
        USE ${dbName};
        INSERT INTO ceuPackages (
          event_id,
          packageName,
          attendanceCriteria,
          paidInFullRequired,
          surveyRequired
        ) VALUES (
          @eventID,
          @packageName,
          @attendanceCriteria,
          @paidInFullRequired,
          @surveyRequired
        );
        SELECT SCOPE_IDENTITY() as id;
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .parameter('packageName', TYPES.VarChar, packageName)
      .parameter('attendanceCriteria', TYPES.TinyInt, attendanceCriteria)
      .parameter('paidInFullRequired', TYPES.Bit, paidInFullRequired)
      .parameter('surveyRequired', TYPES.Bit, surveyRequired)
      .execute();

      const newPackageID = newPackageIDResult[0]?.id;

      // Build out linkages to CE
      await this.savePackageCELinks(newPackageID, categories, vert);

      return {
        success: true,
        message: 'Package Created',
        packageID: newPackageID
      };
    } catch (error) {
      console.error('Error creating award criteria package:', error);
      throw error;
    }
  }

  /**
   * Delete award criteria package
   */
  async deleteAwardCriteriaPackage(eventID, packageID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Check if a grant has previously run on this package
      const grantCountResult = await connection.sql(`
        USE ${dbName};
        SELECT COUNT(*) as count FROM ceuGrants WHERE packageID = @packageID
      `)
      .parameter('packageID', TYPES.Int, packageID)
      .execute();

      const grantCount = grantCountResult[0]?.count || 0;

      if (grantCount > 0) {
        return {
          success: false,
          message: 'Cannot delete package as it has been used in a grant'
        };
      }

      // Delete package and associated category links
      await connection.sql(`
        USE ${dbName};
        DELETE FROM ceuPackageCategories WHERE packageID = @packageID;
        DELETE FROM ceuPackages WHERE packageID = @packageID AND event_id = @eventID;
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('packageID', TYPES.Int, Number(packageID))
      .execute();

      return {
        success: true,
        message: 'Package Deleted'
      };
    } catch (error) {
      console.error('Error deleting award criteria package:', error);
      throw error;
    }
  }

  /**
   * Edit award criteria package
   */
  async editAwardCriteriaPackage(eventID, packageID, body, vert) {
    try {
      const { packageName, attendanceCriteria, paidInFullRequired, surveyRequired, categories } = body;

      if (!categories || !categories.length) {
        return { success: false, message: 'Package must apply to at least one Credit Category' };
      }

      if (await this.checkCategoryInUse(eventID, categories, vert, packageID)) {
        return { success: false, message: 'Package cannot apply to a Credit Category that is already in use' };
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Edit the existing package
      await connection.sql(`
        USE ${dbName};
        UPDATE ceuPackages
        SET
          packageName = @packageName,
          attendanceCriteria = @attendanceCriteria,
          paidInFullRequired = @paidInFullRequired,
          surveyRequired = @surveyRequired
        WHERE packageID = @packageID
          AND event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .parameter('packageID', TYPES.Int, packageID)
      .parameter('packageName', TYPES.VarChar, packageName)
      .parameter('attendanceCriteria', TYPES.TinyInt, attendanceCriteria)
      .parameter('paidInFullRequired', TYPES.Bit, paidInFullRequired)
      .parameter('surveyRequired', TYPES.Bit, surveyRequired)
      .execute();

      // Clear out CE Links so they can be rebuilt
      await connection.sql(`
        USE ${dbName};
        DELETE FROM ceuPackageCategories WHERE packageID = @packageID;
      `)
      .parameter('packageID', TYPES.Int, packageID)
      .execute();

      await this.savePackageCELinks(packageID, categories, vert);

      return {
        success: true,
        message: 'Package Updated'
      };
    } catch (error) {
      console.error('Error editing award criteria package:', error);
      throw error;
    }
  }

  /**
   * Reset award criteria package
   */
  async resetAwardCriteriaPackage(eventID, packageID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Delete all awarded CEs, declined CEs, grants, grant logs, and exceptions
      // Reset doNotAward flag for all CEs associated with this package
      await connection.sql(`
        USE ${dbName};
        DELETE a FROM ceuAwarded a
        JOIN ceuGrantLog gl ON gl.logID = a.grantLogID
        JOIN ceuGrants g ON g.grantID = gl.grantID
        WHERE packageID = @packageID AND g.event_id = @eventID;

        DELETE d FROM ceuDeclined d
        JOIN ceuGrantLog gl ON gl.logID = d.grantLogID
        JOIN ceuGrants g ON g.grantID = gl.grantID
        WHERE packageID = @packageID AND g.event_id = @eventID;

        DELETE FROM ceuGrants WHERE packageID = @packageID AND event_id = @eventID;

        DELETE FROM ceuExceptionLog WHERE packageID = @packageID;

        UPDATE contestant_fees
        SET contestant_fees.doNotAward = 0
        FROM contestant_fees cf
        JOIN ceu_event_fees cef ON cf.eventFeeID = cef.eventFeeID
        JOIN ceu_categories cc ON cc.ceuID = cef.ceuID
        JOIN ceuPackageCategories pc ON pc.ceuID = cc.ceuID
        JOIN ceuPackages p ON pc.packageID = p.packageID
        WHERE p.packageID = @packageID AND p.event_id = @eventID AND cf.doNotAward = 1;
      `)
      .parameter('packageID', TYPES.Int, Number(packageID))
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return {
        success: true,
        message: `Package ${packageID} Reset`
      };
    } catch (error) {
      console.error('Error resetting award criteria package:', error);
      throw error;
    }
  }

  /**
   * Get attendees to award
   */
  async getAttendeesToAward(packageID, vert, filter = {}, categoryID = null, sessionID = null) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      // Build filter object
      const actualFilter = { ...filter };
      if (categoryID) actualFilter.categoryID = categoryID;
      if (sessionID) actualFilter.sessionID = sessionID;

      const sqlQuery = `
        USE ${dbName};
        SELECT
          c.contestant_id,
          u.user_firstname,
          u.user_lastname,
          u.user_state AS userState,
          ef.eventFeeID,
          ef.customFeeName,
          c.checkedIn AS eventCheckIn,
          cf.checkedIn AS sessionCheckIn,
          cf.checkedOut AS sessionCheckOut,
          (ISNULL(c.totalDue,0) - ISNULL(c.couponValue,0) - ISNULL(c.totalPaid,0)) AS balanceDue,
          s.responded AS surveyCompleted,
          cc.ceuID as categoryID,
          cef.ceuValue AS totalAwarded,
          c.bundle_id AS profileID,
          (SELECT
            efb.bundle_name as name,
            cp.bundle_id as id
          FROM ceu_profiles cp
          LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
          WHERE cp.ceuID = cc.ceuID FOR JSON PATH) as categoryProfiles,
          (
            SELECT stateID
            FROM ceu_jurisdictions cj
            WHERE cj.ceuID = cc.ceuID
            FOR JSON PATH
          ) as jurisdictions
        FROM ceuPackages p
        JOIN ceuPackageCategories pc ON p.packageID = pc.packageID
        JOIN ceu_categories cc ON cc.ceuID = pc.ceuID
        JOIN ceu_event_fees cef ON cef.ceuID = pc.ceuID
        JOIN event_fees ef ON cef.eventFeeID = ef.eventFeeID
        JOIN contestant_fees cf ON ef.eventFeeID = cf.eventFeeID
        JOIN eventContestant c ON cf.contestant_id = c.contestant_id
        JOIN b_users u ON c.user_id = u.user_id
        LEFT JOIN (
          SELECT MAX(CAST(ISNULL(si.responded,0) AS int)) AS responded, si.userID, si.surveyID, si.eventID 
          FROM surveyInvitees si
          GROUP BY si.userID, si.surveyID, si.eventID
        ) s ON s.userID = c.user_id AND s.surveyID = ef.surveyID
        WHERE p.packageID = @packageID AND c.regComplete = 1 AND (c.fullscratch IS NULL OR c.fullscratch = 0) AND (cf.scratchClass IS NULL OR cf.scratchClass = 0)
          ${'adminID' in actualFilter ? 'AND u.user_id = @adminID' : ''}
          ${'categoryID' in actualFilter ? 'AND cc.ceuID = @categoryID' : ''}
          ${'sessionID' in actualFilter ? 'AND ef.eventFeeID = @sessionID' : ''}
          AND ISNULL(cef.ceuValue,0) > 0
          AND c.contestant_id NOT IN (SELECT contestant_id FROM ceuAwarded ceua WHERE ceua.eventFeeID = cf.eventFeeID AND ceua.categoryID = cc.ceuID)
          AND (
            (
              1 = CASE p.attendanceCriteria
                WHEN 0 THEN 1
                WHEN 1 THEN ISDATE(c.checkedIn)
                WHEN 2 THEN ISDATE(cf.checkedIn)
                WHEN 3 THEN CASE WHEN ISDATE(cf.checkedIn) = 1 AND ISDATE(cf.checkedOut) = 1 THEN 1 ELSE 0 END
                ELSE 0
              END
              AND 1 = CASE p.paidInFullRequired
                WHEN 0 THEN 1
                WHEN 1 THEN CASE WHEN ISNULL(c.totalDue,0) - ISNULL(c.couponValue,0) - ISNULL(c.totalPaid,0) <= 0 THEN 1 ELSE 0 END
                ELSE 0
              END
              AND 1 = CASE p.surveyRequired
                WHEN 0 THEN 1
                WHEN 1 THEN CASE WHEN (s.responded IS NOT NULL AND s.responded = 1) OR ef.surveyID IS NULL THEN 1 ELSE 0 END
                ELSE 0
              END
              AND cf.doNotAward = 0
            )
            OR c.contestant_id IN (SELECT contestant_id FROM ceuExceptionLog WHERE eventFeeID = cf.eventFeeID)
          )
      `;

      let request = connection.sql(sqlQuery)
        .parameter('packageID', TYPES.Int, Number(packageID));

      if ('adminID' in actualFilter) {
        request.parameter('adminID', TYPES.Int, Number(actualFilter.adminID));
      }
      if ('categoryID' in actualFilter) {
        request.parameter('categoryID', TYPES.Int, Number(actualFilter.categoryID));
      }
      if ('sessionID' in actualFilter) {
        request.parameter('sessionID', TYPES.Int, Number(actualFilter.sessionID));
      }

      let attendees = await request.execute();

      if (attendees && attendees.length) {
        attendees = attendees.map(attendee => {
          attendee.categoryProfiles = attendee.categoryProfiles ? JSON.parse(attendee.categoryProfiles) : [];
          attendee.jurisdictions = attendee.jurisdictions ? JSON.parse(attendee.jurisdictions) : [];
          if (attendee.jurisdictions && attendee.jurisdictions.length) {
            attendee.jurisdictions = attendee.jurisdictions.map(jur => jur.stateID);
            attendee.jurisdictions = states.filter(state => attendee.jurisdictions.includes(state.id));
          }
          return attendee;
        });

        if (attendees.length && attendees[0].categoryProfiles) {
          attendees = filterAttendeesByProfile(attendees, attendees[0].categoryProfiles);
        }
        if (attendees.length && attendees[0].jurisdictions) {
          attendees = filterAttendeesByJurisdiction(attendees, attendees[0].jurisdictions);
        }
      }

      return attendees;
    } catch (error) {
      console.error('Error getting attendees to award:', error);
      throw error;
    }
  }

  /**
   * Get attendees to decline
   */
  async getAttendeesToDecline(packageID, vert, filter = {}, categoryID = null, sessionID = null) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      // Build filter object
      const actualFilter = { ...filter };
      if (categoryID) actualFilter.categoryID = categoryID;
      if (sessionID) actualFilter.sessionID = sessionID;

      const sqlQuery = `
        USE ${dbName};
        SELECT
          c.contestant_id,
          u.user_firstname,
          u.user_lastname,
          u.user_state AS userState,
          ef.eventFeeID,
          ef.customFeeName,
          c.checkedIn AS eventCheckIn,
          cf.checkedIn AS sessionCheckIn,
          cf.checkedOut AS sessionCheckOut,
          (ISNULL(c.totalDue,0) - ISNULL(c.couponValue,0) - ISNULL(c.totalPaid,0)) AS balanceDue,
          s.responded AS surveyCompleted,
          cc.ceuID as categoryID,
          cef.ceuValue AS totalAwarded,
          c.bundle_id AS profileID,
          (SELECT
            efb.bundle_name as name,
            cp.bundle_id as id
          FROM ceu_profiles cp
          LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
          WHERE cp.ceuID = cc.ceuID FOR JSON PATH) as categoryProfiles,
          (
            SELECT stateID
            FROM ceu_jurisdictions cj
            WHERE cj.ceuID = cc.ceuID
            FOR JSON PATH
          ) as jurisdictions
        FROM ceuPackages p
        JOIN ceuPackageCategories pc ON p.packageID = pc.packageID
        JOIN ceu_categories cc ON cc.ceuID = pc.ceuID
        JOIN ceu_event_fees cef ON cef.ceuID = pc.ceuID
        JOIN event_fees ef ON cef.eventFeeID = ef.eventFeeID
        JOIN contestant_fees cf ON ef.eventFeeID = cf.eventFeeID
        JOIN eventContestant c ON cf.contestant_id = c.contestant_id
        JOIN b_users u ON c.user_id = u.user_id
        LEFT JOIN (
          SELECT MAX(CAST(ISNULL(si.responded,0) AS int)) AS responded, si.userID, si.surveyID, si.eventID 
          FROM surveyInvitees si
          GROUP BY si.userID, si.surveyID, si.eventID
        ) s ON s.userID = c.user_id AND s.surveyID = ef.surveyID
        WHERE p.packageID = @packageID AND c.regComplete = 1 AND (c.fullscratch IS NULL OR c.fullscratch = 0) AND (cf.scratchClass IS NULL OR cf.scratchClass = 0)
          ${'adminID' in actualFilter ? 'AND u.user_id = @adminID' : ''}
          ${'categoryID' in actualFilter ? 'AND cc.ceuID = @categoryID' : ''}
          ${'sessionID' in actualFilter ? 'AND ef.eventFeeID = @sessionID' : ''}
          AND ISNULL(cef.ceuValue,0) > 0
          AND c.contestant_id NOT IN (SELECT contestant_id FROM ceuAwarded ceua WHERE ceua.eventFeeID = cf.eventFeeID AND ceua.categoryID = cc.ceuID)
          AND c.contestant_id NOT IN (SELECT contestant_id FROM ceuExceptionLog WHERE eventFeeID = cf.eventFeeID)
          AND (
            0 = CASE p.attendanceCriteria
              WHEN 0 THEN 1
              WHEN 1 THEN ISDATE(c.checkedIn)
              WHEN 2 THEN ISDATE(cf.checkedIn)
              WHEN 3 THEN CASE WHEN ISDATE(cf.checkedIn) = 1 AND ISDATE(cf.checkedOut) = 1 THEN 1 ELSE 0 END
              ELSE 0
            END
            OR 0 = CASE p.paidInFullRequired
              WHEN 0 THEN 1
              WHEN 1 THEN CASE WHEN ISNULL(c.totalDue,0) - ISNULL(c.couponValue,0) - ISNULL(c.totalPaid,0) <= 0 THEN 1 ELSE 0 END
              ELSE 0
            END
            OR 0 = CASE p.surveyRequired
              WHEN 0 THEN 1
              WHEN 1 THEN CASE WHEN (s.responded IS NOT NULL AND s.responded = 1) OR ef.surveyID IS NULL THEN 1 ELSE 0 END
              ELSE 0
            END
            OR cf.doNotAward = 1
          )
      `;

      let request = connection.sql(sqlQuery)
        .parameter('packageID', TYPES.Int, Number(packageID));

      if ('adminID' in actualFilter) {
        request.parameter('adminID', TYPES.Int, Number(actualFilter.adminID));
      }
      if ('categoryID' in actualFilter) {
        request.parameter('categoryID', TYPES.Int, Number(actualFilter.categoryID));
      }
      if ('sessionID' in actualFilter) {
        request.parameter('sessionID', TYPES.Int, Number(actualFilter.sessionID));
      }

      let attendees = await request.execute();

      if (attendees && attendees.length) {
        attendees = attendees.map(attendee => {
          attendee.categoryProfiles = attendee.categoryProfiles ? JSON.parse(attendee.categoryProfiles) : [];
          attendee.jurisdictions = attendee.jurisdictions ? JSON.parse(attendee.jurisdictions) : [];
          if (attendee.jurisdictions && attendee.jurisdictions.length) {
            attendee.jurisdictions = attendee.jurisdictions.map(jur => jur.stateID);
            attendee.jurisdictions = states.filter(state => attendee.jurisdictions.includes(state.id));
          }
          return attendee;
        });

        if (attendees.length && attendees[0].categoryProfiles) {
          attendees = filterAttendeesByProfile(attendees, attendees[0].categoryProfiles);
        }
        if (attendees.length && attendees[0].jurisdictions) {
          attendees = filterAttendeesByJurisdiction(attendees, attendees[0].jurisdictions);
        }
      }

      return attendees;
    } catch (error) {
      console.error('Error getting attendees to decline:', error);
      throw error;
    }
  }

  /**
   * Get exception log
   */
  async getExceptionLog(eventID, packageID, categoryID, sessionID, pending, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const sqlQuery = `
        USE ${dbName};
        SELECT DISTINCT
          el.logID,
          el.dateAdded,
          el.contestant_id,
          cu.user_firstname AS attendeeFirstName,
          cu.user_lastname AS attendeeLastName,
          cu.user_state AS userState,
          ef.customFeeName AS sessionName,
          el.eventFeeID,
          el.categoryID,
          el.packageID,
          el.exceptionText,
          el.adminUserID,
          au.user_firstname AS adminFirstName,
          au.user_lastname AS adminLastName,
          ec.bundle_id AS profileID,
          (SELECT
            efb.bundle_name as name,
            cp.bundle_id as id
          FROM ceu_profiles cp
          LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
          WHERE cp.ceuID = cef.ceuID FOR JSON PATH) as categoryProfiles,
          (
            SELECT stateID
            FROM ceu_jurisdictions cj
            WHERE cj.ceuID = cef.ceuID
            FOR JSON PATH
          ) as jurisdictions
        FROM ceuExceptionLog el
        JOIN eventContestant ec ON el.contestant_id = ec.contestant_id
        JOIN b_users cu ON ec.user_id = cu.user_id
        JOIN b_users au ON el.adminUserID = au.user_id
        JOIN ceuPackageCategories pc ON el.packageID = pc.packageID
        JOIN ceu_event_fees cef ON cef.ceuID = pc.ceuID
        JOIN event_fees ef ON el.eventFeeID = ef.eventFeeID AND cef.eventFeeID = ef.eventFeeID
        LEFT JOIN (
          SELECT MAX(CAST(ISNULL(si.responded,0) AS int)) AS responded, si.userID, si.surveyID, si.eventID 
          FROM surveyInvitees si
          GROUP BY si.userID, si.surveyID, si.eventID
        ) s ON s.userID = cu.user_id AND s.surveyID = ef.surveyID
        ${pending ? 'LEFT JOIN' : 'JOIN'} ceuAwarded ceua ON (ceua.categoryID = el.categoryID) AND (ceua.eventFeeID = el.eventFeeID) AND (ceua.contestant_id = el.contestant_id)
        WHERE el.packageID = @packageID AND el.categoryID = @categoryID AND el.eventFeeID = @sessionID AND ec.event_id = @eventID AND ec.regComplete = 1 ${pending ? 'AND ceua.awardID IS NULL' : ''}
        ORDER BY el.logID DESC
      `;

      const request = connection.sql(sqlQuery)
        .parameter('eventID', TYPES.Int, Number(eventID))
        .parameter('packageID', TYPES.Int, Number(packageID))
        .parameter('categoryID', TYPES.Int, Number(categoryID))
        .parameter('sessionID', TYPES.Int, Number(sessionID));

      let exceptions = await request.execute();

      if (exceptions && exceptions.length) {
        exceptions = exceptions.map(attendee => {
          attendee.categoryProfiles = attendee.categoryProfiles ? JSON.parse(attendee.categoryProfiles) : [];
          attendee.jurisdictions = attendee.jurisdictions ? JSON.parse(attendee.jurisdictions) : [];
          if (attendee.jurisdictions && attendee.jurisdictions.length) {
            attendee.jurisdictions = attendee.jurisdictions.map(jur => jur.stateID);
            attendee.jurisdictions = states.filter(state => attendee.jurisdictions.includes(state.id));
          }
          return attendee;
        });

        if (exceptions.length && exceptions[0].categoryProfiles) {
          exceptions = filterAttendeesByProfile(exceptions, exceptions[0].categoryProfiles);
        }
        if (exceptions.length && exceptions[0].jurisdictions) {
          exceptions = filterAttendeesByJurisdiction(exceptions, exceptions[0].jurisdictions);
        }
      }

      return exceptions;
    } catch (error) {
      console.error('Error getting exception log:', error);
      throw error;
    }
  }

  /**
   * Add award exception
   */
  async addAwardException(body, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const result = await connection.sql(`
        USE ${dbName};
        INSERT INTO ceuExceptionLog (contestant_id, packageID, categoryID, eventFeeID, exceptionText, adminUserID)
        OUTPUT INSERTED.logID
        VALUES (@attendeeID, @packageID, @categoryID, @sessionID, @exceptionText, @adminUserID)
      `)
      .parameter('attendeeID', TYPES.Int, Number(body.attendeeID))
      .parameter('packageID', TYPES.Int, Number(body.packageID))
      .parameter('categoryID', TYPES.Int, Number(body.categoryID))
      .parameter('sessionID', TYPES.Int, Number(body.sessionID))
      .parameter('exceptionText', TYPES.VarChar, body.exceptionText || '')
      .parameter('adminUserID', TYPES.Int, Number(body.adminUserID))
      .execute();

      return {
        success: true,
        message: 'Exception added!',
        logID: result[0]?.logID
      };
    } catch (error) {
      console.error('Error adding award exception:', error);
      return {
        success: false,
        status: 'fail',
        message: error.message
      };
    }
  }

  /**
   * Update award exception
   */
  async updateAwardException(logID, body, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        UPDATE ceuExceptionLog
        SET exceptionText = @exceptionText
        WHERE logID = @logID
      `)
      .parameter('logID', TYPES.Int, Number(logID))
      .parameter('exceptionText', TYPES.VarChar, String(body.exceptionText || ''))
      .execute();

      return { logID: logID, success: true };
    } catch (error) {
      console.error('Error updating award exception:', error);
      throw error;
    }
  }

  /**
   * Remove award exception
   */
  async removeAwardException(logID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        DELETE FROM ceuExceptionLog WHERE logID = @logID
      `)
      .parameter('logID', TYPES.Int, Number(logID))
      .execute();

      return { success: true };
    } catch (error) {
      console.error('Error removing award exception:', error);
      throw error;
    }
  }

  /**
   * Get transcript template
   */
  async getTranscriptTemplate(edit, preview, eventID, userID, vert) {
    try {
      // TODO: Implement full transcript template rendering with EJS
      // This requires EJS template file and full template data
      // For now, return empty string as placeholder
      console.log('getTranscriptTemplate called - EJS template rendering pending');
      return '';
    } catch (error) {
      console.error('Error getting transcript template:', error);
      throw error;
    }
  }

  /**
   * Run cron scheduled runs
   */
  async runCronScheduledRuns(verts) {
    try {
      // TODO: Implement cron job logic to run scheduled grants
      // This is typically called by a scheduled Lambda function
      console.log('runCronScheduledRuns called - cron implementation pending');
      return [];
    } catch (error) {
      console.error('Error running cron scheduled runs:', error);
      throw error;
    }
  }

  /**
   * Get cron scheduled runs
   */
  async getCronScheduledRuns(vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get all grants that should be run based on the current date and time
      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT
          g.grantID,
          g.event_id,
          g.packageID,
          g.admin_user_id,
          g.runType,
          g.startDate,
          g.testMode
        FROM ceuGrants g
        WHERE g.runType != 'once' 
          AND g.archived = 0
          AND (
            (g.runType = 'daily' AND CAST(GETDATE() AS DATE) >= CAST(g.startDate AS DATE))
            OR (g.runType = 'weekly' AND DATEPART(WEEKDAY, GETDATE()) = DATEPART(WEEKDAY, g.startDate) AND CAST(GETDATE() AS DATE) >= CAST(g.startDate AS DATE))
            OR (g.runType = 'monthly' AND DATEPART(DAY, GETDATE()) = DATEPART(DAY, g.startDate) AND CAST(GETDATE() AS DATE) >= CAST(g.startDate AS DATE))
          )
      `)
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting cron scheduled runs:', error);
      throw error;
    }
  }

  /**
   * Get scheduled runs
   */
  async getScheduledRuns(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT * FROM ceuGrants WHERE event_id = @eventID AND runType != 'once' AND archived = 0
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting scheduled runs:', error);
      throw error;
    }
  }

  /**
   * Create grant
   */
  async createGrant(eventID, body, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const result = await connection.sql(`
        USE ${dbName};
        INSERT INTO ceuGrants (
          event_id,
          packageID,
          admin_user_id,
          certificateTemplateID,
          emailTemplateID,
          sendTo,
          runType,
          startDate,
          testMode
        )
        OUTPUT INSERTED.grantID
        VALUES (
          @eventID,
          @packageID,
          @admin_user_id,
          @certificateTemplateID,
          @emailTemplateID,
          @sendTo,
          @runType,
          @startDate,
          @testMode
        );
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('packageID', TYPES.Int, Number(body.packageID))
      .parameter('admin_user_id', TYPES.Int, Number(body.adminID))
      .parameter('certificateTemplateID', TYPES.Int, body.certificateTemplateID ? Number(body.certificateTemplateID) : null)
      .parameter('emailTemplateID', TYPES.Int, body.emailTemplateID ? Number(body.emailTemplateID) : null)
      .parameter('sendTo', TYPES.Bit, body.emailTemplateID ? Number(body.sendTo) : null)
      .parameter('runType', TYPES.VarChar, body.runType)
      .parameter('startDate', TYPES.DateTime, new Date(body.startDate))
      .parameter('testMode', TYPES.Bit, Number(body.testMode))
      .execute();

      const grantResult = {
        success: true,
        message: 'Grant Created',
        grantID: result[0]?.grantID
      };

      // If runType is 'once' and testMode is set, run the grant immediately
      if (body.runType && body.runType === 'once' && ('testMode' in body)) {
        // TODO: Implement runGrant method
        console.log('runGrant called - needs implementation');
      }

      return grantResult;
    } catch (error) {
      console.error('Error creating grant:', error);
      return {
        status: 'fail',
        message: error.message
      };
    }
  }

  /**
   * Remove scheduled run
   */
  async removeScheduledRun(eventID, grantID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        UPDATE ceuGrants
        SET archived = 1
        WHERE event_id = @eventID AND grantID = @grantID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('grantID', TYPES.Int, Number(grantID))
      .execute();

      return {
        success: true,
        message: 'Run Deleted'
      };
    } catch (error) {
      console.error('Error removing scheduled run:', error);
      throw error;
    }
  }

  /**
   * Get recent runs
   */
  async getRecentRuns(eventID, scheduled, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const runType = scheduled === "manual" ? "AND g.runType = 'once'" : "AND g.runType != 'once'";

      const results = await connection.sql(`
        USE ${dbName};
        SELECT gl.logID, u.user_firstname AS adminFirstName, u.user_lastname AS adminLastName,
          p.packageName, p.packageID, gl.runDate, g.runType, g.testMode
        FROM ceuGrantLog gl 
        JOIN ceuGrants g ON g.grantID = gl.grantID
        JOIN ceuPackages p ON p.packageID = g.packageID
        JOIN b_users u ON u.user_id = gl.admin_user_id
        WHERE g.event_id = @eventID ${runType}
        GROUP BY gl.logID, u.user_firstname, u.user_lastname,
          p.packageName, gl.runDate, g.runType, g.testMode, p.packageID
        ORDER BY gl.logID DESC
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      const processed = results.map(run => {
        run.expanded = false;
        return run;
      });

      return processed;
    } catch (error) {
      console.error('Error getting recent runs:', error);
      throw error;
    }
  }

  /**
   * Get recent run details
   */
  async getRecentRunDetails(eventID, logID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT TOP 1 gl.logID,
          (SELECT DISTINCT cec.ceuCategory AS name, cec.ceuID AS categoryID,
            a.contestant_id, a.eventFeeID
          FROM ceu_categories cec
            JOIN ceuPackageCategories pc ON cec.ceuID = pc.ceuID
            JOIN ceu_event_fees cef ON cef.ceuID = cec.ceuID
            JOIN ceuAwarded a ON gl.logID = a.grantLogID
          WHERE pc.packageID = p.packageID AND
            a.grantLogID = gl.logID AND
            (cef.eventFeeID = a.eventFeeID)
          FOR JSON PATH) AS ceuCategoriesAwarded,
          (SELECT DISTINCT cec.ceuCategory AS name, cec.ceuID AS categoryID,
            d.contestant_id, d.eventFeeID
          FROM ceu_categories cec
            JOIN ceuPackageCategories pc ON cec.ceuID = pc.ceuID
            JOIN ceu_event_fees cef ON cef.ceuID = cec.ceuID
            JOIN ceuDeclined d ON gl.logID = d.grantLogID
          WHERE pc.packageID = p.packageID AND
            d.grantLogID = gl.logID AND
            (cef.eventFeeID = d.eventFeeID)
          FOR JSON PATH) AS ceuCategoriesDeclined,
          (SELECT DISTINCT ef.eventFeeID, ef.customFeeName AS name, cec.ceuID, cec.ceuCategory, cec.ceuCode
            FROM event_fees ef
            JOIN ceu_event_fees cef ON cef.eventFeeID = ef.eventFeeID
            JOIN ceuPackageCategories pc ON cef.ceuID = pc.ceuID
            JOIN ceu_categories cec ON cec.ceuID = pc.ceuID
            LEFT JOIN ceuAwarded ceua ON ceua.grantLogID = gl.logID AND ceua.eventFeeID = ef.eventFeeID
            LEFT JOIN ceuDeclined ceud ON ceud.grantLogID = gl.logID AND ceud.eventFeeID = ef.eventFeeID
            WHERE pc.packageID = p.packageID AND cec.archived != 1 AND cec.ceuID = cef.ceuID
              AND (gl.logID = ceua.grantLogID OR gl.logID = ceud.grantLogID)
            ORDER BY cec.ceuID
            FOR JSON PATH) AS ceuRegItems,
          (SELECT DISTINCT ef.eventFeeID, ef.customFeeName, ceua.categoryID, ceua.contestant_id, ceua.awardID
            FROM event_fees ef
            JOIN ceu_event_fees cef ON cef.eventFeeID = ef.eventFeeID
            JOIN ceuPackageCategories pc ON cef.ceuID = pc.ceuID
            JOIN ceuAwarded ceua ON ceua.eventFeeID = ef.eventFeeID
            WHERE pc.packageID = p.packageID AND ceua.grantLogID = gl.logID
            FOR JSON PATH) AS ceuRegAwarded,
          (SELECT DISTINCT ef.eventFeeID, ef.customFeeName, ceud.categoryID, ceud.contestant_id
            FROM event_fees ef
            JOIN ceu_event_fees cef ON cef.eventFeeID = ef.eventFeeID
            JOIN ceuPackageCategories pc ON cef.ceuID = pc.ceuID
            JOIN ceuDeclined ceud ON ceud.eventFeeID = ef.eventFeeID
            WHERE pc.packageID = p.packageID AND ceud.grantLogID = gl.logID
            FOR JSON PATH) AS ceuRegDeclined
        FROM ceuGrantLog gl 
        JOIN ceuGrants g ON g.grantID = gl.grantID
        JOIN ceuPackages p ON p.packageID = g.packageID
        WHERE g.event_id = @eventID AND gl.logID = @logID
        GROUP BY gl.logID, p.packageName, gl.runDate, p.packageID
        ORDER BY gl.logID DESC
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('logID', TYPES.Int, Number(logID))
      .execute();

      if (!results || !results.length) {
        return {};
      }

      const row = results[0];
      row.ceuTotals = {};

      if (row.ceuRegItems) {
        row.ceuRegItems = JSON.parse(row.ceuRegItems);
      }

      if (row.ceuRegAwarded) {
        row.ceuRegAwarded = JSON.parse(row.ceuRegAwarded);
        row.ceuRegAwarded.forEach(item => {
          const uniqueItems = `${item.eventFeeID}_${item.categoryID}`;
          if (row.ceuTotals[uniqueItems]) {
            if (item.awardID) {
              row.ceuTotals[uniqueItems].awardedCount += 1;
            }
          } else {
            row.ceuTotals[uniqueItems] = {
              awardedCount: item.awardID ? 1 : 0,
              declinedCount: item.declineID ? 1 : 0
            };
          }
        });
      }

      if (row.ceuRegDeclined) {
        row.ceuRegDeclined = JSON.parse(row.ceuRegDeclined);
        row.ceuRegDeclined.forEach(item => {
          const uniqueItems = `${item.eventFeeID}_${item.categoryID}`;
          if (row.ceuTotals[uniqueItems]) {
            if (!item.awardID) {
              row.ceuTotals[uniqueItems].declinedCount += 1;
            }
          } else {
            row.ceuTotals[uniqueItems] = {
              awardedCount: item.awardID ? 1 : 0,
              declinedCount: item.awardID ? 0 : 1
            };
          }
        });
      }

      if (row.ceuCategoriesAwarded) {
        row.ceuCategoriesAwarded = JSON.parse(row.ceuCategoriesAwarded);
      }

      if (row.ceuCategoriesDeclined) {
        row.ceuCategoriesDeclined = JSON.parse(row.ceuCategoriesDeclined);
      }

      return row;
    } catch (error) {
      console.error('Error getting recent run details:', error);
      throw error;
    }
  }

  /**
   * Get affected attendees count
   */
  async getAffectedAttendeesCount(eventID, packageID, testMode, vert) {
    try {
      if (testMode) {
        return { affectedCount: 1 };
      }

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT c.contestant_id,
          c.bundle_id AS profileID,
          (SELECT
            efb.bundle_name AS name,
            cp.bundle_id AS id
          FROM ceu_profiles cp
          LEFT JOIN event_fee_bundles efb on efb.bundle_id = cp.bundle_id
          WHERE cp.ceuID = cc.ceuID FOR JSON PATH) AS categoryProfiles,
          (
            SELECT stateID
            FROM ceu_jurisdictions cj
            WHERE cj.ceuID = cc.ceuID
            FOR JSON PATH
          ) AS jurisdictions,
          u.user_state AS userState,
          el.logID AS exceptionLogID
        FROM ceuPackages p
        JOIN ceuPackageCategories pc ON p.packageID = pc.packageID
        JOIN ceu_categories cc ON cc.ceuID = pc.ceuID
        JOIN ceu_event_fees cef ON cef.ceuID = pc.ceuID
        JOIN event_fees ef ON cef.eventFeeID = ef.eventFeeID
        JOIN contestant_fees cf ON ef.eventFeeID = cf.eventFeeID
        JOIN eventContestant c ON cf.contestant_id = c.contestant_id
        JOIN b_users u ON c.user_id = u.user_id
        LEFT JOIN ceuExceptionLog el ON el.contestant_id = c.contestant_id AND el.categoryID = cef.ceuID AND el.eventFeeID = cef.eventFeeID
        LEFT JOIN (
          SELECT MAX(CAST(ISNULL(si.responded,0) AS int)) AS responded, si.userID, si.surveyID, si.eventID 
          FROM surveyInvitees si
          GROUP BY si.userID, si.surveyID, si.eventID
        ) s ON s.userID = c.user_id AND s.surveyID = ef.surveyID
        WHERE p.event_id = @eventID AND p.packageID = @packageID AND c.regComplete = 1 AND (c.fullscratch IS NULL OR c.fullscratch = 0) AND (cf.scratchClass IS NULL OR cf.scratchClass = 0) AND (cf.doNotAward = 0 OR el.logID IS NOT NULL)
          AND ISNULL(cef.ceuValue,0) > 0
          AND c.contestant_id NOT IN (SELECT contestant_id FROM ceuAwarded ceua WHERE ceua.eventFeeID = cf.eventFeeID AND ceua.categoryID = cc.ceuID)
        GROUP BY c.contestant_id, c.bundle_id, cc.ceuID, u.user_state, el.logID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('packageID', TYPES.Int, Number(packageID))
      .execute();

      let count = 0;
      if (results && results.length) {
        const processed = results.map(attendee => {
          attendee.categoryProfiles = attendee.categoryProfiles ? JSON.parse(attendee.categoryProfiles) : [];
          attendee.jurisdictions = attendee.jurisdictions ? JSON.parse(attendee.jurisdictions) : [];
          if (attendee.jurisdictions && attendee.jurisdictions.length) {
            attendee.jurisdictions = attendee.jurisdictions.map(jur => jur.stateID);
            attendee.jurisdictions = states.filter(state => attendee.jurisdictions.includes(state.id));
          }
          return attendee;
        });

        let filtered = processed;
        if (filtered.length && filtered[0].categoryProfiles) {
          filtered = filterAttendeesByProfile(filtered, filtered[0].categoryProfiles);
        }
        if (filtered.length && filtered[0].jurisdictions) {
          filtered = filterAttendeesByJurisdiction(filtered, filtered[0].jurisdictions);
        }
        count = filtered.length;
      }

      return { affectedCount: count };
    } catch (error) {
      console.error('Error getting affected attendees count:', error);
      throw error;
    }
  }

  /**
   * Get awarded attendees
   */
  async getAwardedAttendees(eventID, logID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT p.packageName, l.runDate, ec.contestant_id, u.user_firstname AS firstName, u.user_lastname AS lastName, ef.customFeeName AS sessionName, g.certificateTemplateID, g.emailTemplateID,
        (SELECT DISTINCT cec.ceuCategory AS name, cec.ceuID AS categoryID,
          a.contestant_id, a.eventFeeID, ef.customFeeName
        FROM ceu_categories cec
          JOIN ceuPackageCategories pc ON cec.ceuID = pc.ceuID
          JOIN ceu_event_fees cefa ON cefa.ceuID = cec.ceuID
          JOIN ceuAwarded a ON a.categoryID = cec.ceuID AND a.eventFeeID = cefa.eventFeeID
        WHERE pc.packageID = p.packageID AND
          ec.contestant_id = a.contestant_id AND
          cefa.eventFeeID = ef.eventFeeID
        FOR JSON PATH) AS ceuCategories
        FROM ceuAwarded a 
        JOIN ceuGrantLog l ON a.grantLogID = l.logID
        JOIN eventContestant ec ON a.contestant_id = ec.contestant_id
        JOIN b_users u ON u.user_id = ec.user_id
        JOIN ceuGrants g ON l.grantID = g.grantID
        JOIN ceuPackages p ON g.packageID = p.packageID
        JOIN ceu_event_fees cef ON a.eventFeeID = cef.eventFeeID
        JOIN event_fees ef ON cef.eventFeeID = ef.eventFeeID
        WHERE a.event_id = @eventID AND a.grantLogID = @logID
        ORDER BY u.user_firstname, u.user_lastname
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('logID', TYPES.Int, Number(logID))
      .execute();

      const processed = results.map(row => {
        row.packageName = row.packageName;
        row.runDate = row.runDate;
        row.firstName = row.firstName;
        row.lastName = row.lastName;
        row.fullName = row.firstName + ' ' + row.lastName;
        row.sessionName = row.sessionName;
        row.ceuCategories = row.ceuCategories ? JSON.parse(row.ceuCategories) : [];
        return row;
      });

      return processed;
    } catch (error) {
      console.error('Error getting awarded attendees:', error);
      throw error;
    }
  }

  /**
   * Get declined attendees
   */
  async getDeclinedAttendees(eventID, logID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT p.packageName, l.runDate, ec.contestant_id, u.user_firstname AS firstName, u.user_lastname AS lastName, ef.eventFeeID, ef.customFeeName AS sessionName,
        (SELECT DISTINCT cec.ceuCategory AS name, cec.ceuID AS categoryID,
          d.contestant_id, d.eventFeeID, ef.customFeeName
        FROM ceu_categories cec
          JOIN ceuPackageCategories pc ON cec.ceuID = pc.ceuID
          JOIN ceu_event_fees cefd ON cefd.ceuID = cec.ceuID
          JOIN ceuDeclined d ON d.categoryID = cec.ceuID AND d.eventFeeID = cefd.eventFeeID
        WHERE pc.packageID = p.packageID AND
          ec.contestant_id = d.contestant_id AND
          cefd.eventFeeID = ef.eventFeeID
        FOR JSON PATH) AS ceuCategories
        FROM ceuDeclined d 
        JOIN ceuGrantLog l ON d.grantLogID = l.logID
        JOIN eventContestant ec ON d.contestant_id = ec.contestant_id
        JOIN b_users u ON u.user_id = ec.user_id
        JOIN ceuGrants g ON l.grantID = g.grantID
        JOIN ceuPackages p ON g.packageID = p.packageID
        JOIN ceuPackageCategories pc ON p.packageID = pc.packageID
        JOIN ceu_event_fees cef ON d.eventFeeID = cef.eventFeeID
        JOIN event_fees ef ON cef.eventFeeID = ef.eventFeeID
        WHERE d.event_id = @eventID AND d.grantLogID = @logID
        ORDER BY u.user_firstname, u.user_lastname
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('logID', TYPES.Int, Number(logID))
      .execute();

      const processed = results.map(row => {
        row.packageName = row.packageName;
        row.runDate = row.runDate;
        row.firstName = row.firstName;
        row.lastName = row.lastName;
        row.fullName = row.firstName + ' ' + row.lastName;
        row.sessionName = row.sessionName;
        row.ceuCategories = row.ceuCategories ? JSON.parse(row.ceuCategories) : [];
        return row;
      });

      return processed;
    } catch (error) {
      console.error('Error getting declined attendees:', error);
      throw error;
    }
  }

  /**
   * Get awarded by reg item ID
   */
  async getAwardedByRegItemID(eventID, logID, catID, itemID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT c.contestant_id,
          u.user_firstname AS firstName,
          u.user_lastname AS lastName,
          ceua.eventFeeID,
          ef.customFeeName,
          c.checkedIn AS eventCheckIn,
          cf.checkedIn AS sessionCheckIn,
          cf.checkedOut AS sessionCheckOut,
          (ISNULL(c.totalDue,0) - ISNULL(c.couponValue,0) - ISNULL(c.totalPaid,0)) AS balanceDue,
          s.responded AS surveyCompleted,
          ceua.ceuValue AS credits,
          ceua.awardID,
          el.logID AS exceptionLogID
        FROM ceuAwarded ceua
        JOIN ceuGrantLog gl ON ceua.grantLogID = gl.logID
        JOIN ceu_event_fees cef ON cef.eventFeeID = ceua.eventFeeID
        JOIN event_fees ef ON ceua.eventFeeID = ef.eventFeeID
        JOIN contestant_fees cf ON ceua.eventFeeID = cf.eventFeeID AND cf.contestant_id = ceua.contestant_id
        JOIN eventContestant c ON ceua.contestant_id = c.contestant_id
        JOIN b_users u ON c.user_id = u.user_id
        LEFT JOIN (
          SELECT MAX(CAST(ISNULL(si.responded,0) AS int)) AS responded, si.userID, si.surveyID, si.eventID 
          FROM surveyInvitees si
          GROUP BY si.userID, si.surveyID, si.eventID
        ) s ON s.userID = c.user_id AND s.surveyID = ef.surveyID
        LEFT JOIN ceuExceptionLog el ON el.eventFeeID = cf.eventFeeID AND el.contestant_id = c.contestant_id
        WHERE ceua.event_id = @eventID AND ceua.grantLogID = @logID AND ceua.eventFeeID = @regItemID AND ceua.categoryID = @categoryID
        ORDER BY u.user_firstname, u.user_lastname
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('logID', TYPES.Int, Number(logID))
      .parameter('regItemID', TYPES.Int, Number(itemID))
      .parameter('categoryID', TYPES.Int, Number(catID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting awarded by reg item ID:', error);
      throw error;
    }
  }

  /**
   * Get declined by reg item ID
   */
  async getDeclinedByRegItemID(eventID, logID, catID, itemID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT c.contestant_id,
          u.user_firstname AS firstName,
          u.user_lastname AS lastName,
          ceud.eventFeeID,
          ef.customFeeName,
          c.checkedIn AS eventCheckIn,
          cf.checkedIn AS sessionCheckIn,
          cf.checkedOut AS sessionCheckOut,
          (ISNULL(c.totalDue,0) - ISNULL(c.couponValue,0) - ISNULL(c.totalPaid,0)) AS balanceDue,
          s.responded AS surveyCompleted
        FROM ceuDeclined ceud
        JOIN ceuGrantLog gl ON ceud.grantLogID = gl.logID
        JOIN ceu_event_fees cef ON cef.eventFeeID = ceud.eventFeeID
        JOIN event_fees ef ON ceud.eventFeeID = ef.eventFeeID
        JOIN contestant_fees cf ON ceud.eventFeeID = cf.eventFeeID AND cf.contestant_id = ceud.contestant_id
        JOIN eventContestant c ON ceud.contestant_id = c.contestant_id
        JOIN b_users u ON c.user_id = u.user_id
        LEFT JOIN (
          SELECT MAX(CAST(ISNULL(si.responded,0) AS int)) AS responded, si.userID, si.surveyID, si.eventID 
          FROM surveyInvitees si
          GROUP BY si.userID, si.surveyID, si.eventID
        ) s ON s.userID = c.user_id AND s.surveyID = ef.surveyID
        WHERE ceud.event_id = @eventID AND ceud.grantLogID = @logID AND ceud.eventFeeID = @regItemID AND ceud.categoryID = @categoryID
        ORDER BY u.user_firstname, u.user_lastname
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('logID', TYPES.Int, Number(logID))
      .parameter('regItemID', TYPES.Int, Number(itemID))
      .parameter('categoryID', TYPES.Int, Number(catID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting declined by reg item ID:', error);
      throw error;
    }
  }

  /**
   * Unaward attendee
   */
  async unawardAttendee(eventID, awardID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Mark the item as doNotAward for future runs
      await connection.sql(`
        USE ${dbName};
        UPDATE contestant_fees
        SET contestant_fees.doNotAward = 1
        FROM contestant_fees cf
        JOIN ceuAwarded ceua ON cf.eventFeeID = ceua.eventFeeID AND cf.contestant_id = ceua.contestant_id
        JOIN ceu_categories cc ON ceua.categoryID = cc.ceuID
        WHERE ceua.awardID = @awardID AND cf.event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('awardID', TYPES.Int, Number(awardID))
      .execute();

      // Delete the award
      await connection.sql(`
        USE ${dbName};
        DELETE FROM ceuAwarded WHERE event_id = @eventID AND awardID = @awardID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .parameter('awardID', TYPES.Int, Number(awardID))
      .execute();

      return { success: true, unawarded: { awardID: awardID } };
    } catch (error) {
      console.error('Error unawarding attendee:', error);
      throw error;
    }
  }

  /**
   * Get event sessions
   */
  async getEventSessions(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const results = await connection.sql(`
        USE ${dbName};
        SELECT ef.eventFeeID AS id, ef.customFeeName AS sessionName
        FROM event_fees ef
        WHERE ef.event_id = @eventID AND ISNULL(ef.invisible, 0) = 0
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

      return results;
    } catch (error) {
      console.error('Error getting event sessions:', error);
      throw error;
    }
  }

  /**
   * Save transcript config
   */
  async saveTranscriptConfig(eventID, config, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const transcriptIDResult = await connection.sql(`
        USE ${dbName};
        IF EXISTS (SELECT 1 FROM ceuTranscripts WHERE event_id = @eventID)
        BEGIN
          UPDATE ceuTranscripts
          SET
            logoType = @logoType,
            showOrgBelowLogo = @showOrgBelowLogo,
            orgName = @orgName,
            orgPhone = @orgPhone,
            orgMobile = @orgMobile,
            orgContact = @orgContact,
            langBlock = @langBlock,
            nameInHeader = @nameInHeader,
            emailInHeader = @emailInHeader,
            mobileHeader = @mobileHeader,
            phoneInHeader = @phoneInHeader,
            orgInHeader = @orgInHeader,
            orgInHostDetails = @orgInHostDetails,
            orgContactInHostDetails = @orgContactInHostDetails,
            orgPhoneInHostDetails = @orgPhoneInHostDetails,
            showColDate = @showColDate,
            showColEvent = @showColEvent,
            showColSession = @showColSession,
            showColCategory = @showColCategory,
            showColCode = @showColCode,
            showColVal = @showColVal,
            showColCheckInOut = @showColCheckInOut
          WHERE event_id = @eventID;
        END
        ELSE
        BEGIN
          INSERT INTO ceuTranscripts (
            event_id, logoType, showOrgBelowLogo, orgName, orgPhone, orgMobile, orgContact,
            langBlock, nameInHeader, emailInHeader, mobileHeader, phoneInHeader, orgInHeader,
            orgInHostDetails, orgContactInHostDetails, orgPhoneInHostDetails,
            showColDate, showColEvent, showColSession, showColCategory, showColCode, showColVal, showColCheckInOut
          ) VALUES (
            @eventID, @logoType, @showOrgBelowLogo, @orgName, @orgPhone, @orgMobile, @orgContact,
            @langBlock, @nameInHeader, @emailInHeader, @mobileHeader, @phoneInHeader, @orgInHeader,
            @orgInHostDetails, @orgContactInHostDetails, @orgPhoneInHostDetails,
            @showColDate, @showColEvent, @showColSession, @showColCategory, @showColCode, @showColVal, @showColCheckInOut
          );
        END
        SELECT transcriptID FROM ceuTranscripts WHERE event_id = @eventID;
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .parameter('logoType', TYPES.VarChar, config.logoType || '')
      .parameter('showOrgBelowLogo', TYPES.Bit, config.showOrgBelowLogo ? 1 : 0)
      .parameter('orgName', TYPES.VarChar, config.orgName || '')
      .parameter('orgPhone', TYPES.VarChar, config.orgPhone || '')
      .parameter('orgMobile', TYPES.VarChar, config.orgMobile || '')
      .parameter('orgContact', TYPES.VarChar, config.orgContact || '')
      .parameter('langBlock', TYPES.VarChar, config.langBlock || '')
      .parameter('nameInHeader', TYPES.Bit, config.nameInHeader ? 1 : 0)
      .parameter('emailInHeader', TYPES.Bit, config.emailInHeader ? 1 : 0)
      .parameter('mobileHeader', TYPES.Bit, config.mobileHeader ? 1 : 0)
      .parameter('phoneInHeader', TYPES.Bit, config.phoneInHeader ? 1 : 0)
      .parameter('orgInHeader', TYPES.Bit, config.orgInHeader ? 1 : 0)
      .parameter('orgInHostDetails', TYPES.Bit, config.orgInHostDetails ? 1 : 0)
      .parameter('orgContactInHostDetails', TYPES.Bit, config.orgContactInHostDetails ? 1 : 0)
      .parameter('orgPhoneInHostDetails', TYPES.Bit, config.orgPhoneInHostDetails ? 1 : 0)
      .parameter('showColDate', TYPES.Bit, config.showColDate ? 1 : 0)
      .parameter('showColEvent', TYPES.Bit, config.showColEvent ? 1 : 0)
      .parameter('showColSession', TYPES.Bit, config.showColSession ? 1 : 0)
      .parameter('showColCategory', TYPES.Bit, config.showColCategory ? 1 : 0)
      .parameter('showColCode', TYPES.Bit, config.showColCode ? 1 : 0)
      .parameter('showColVal', TYPES.Bit, config.showColVal ? 1 : 0)
      .parameter('showColCheckInOut', TYPES.Bit, config.showColCheckInOut ? 1 : 0)
      .execute();

      const transcriptID = transcriptIDResult[0]?.transcriptID;

      // Delete existing custom field links
      await connection.sql(`
        USE ${dbName};
        DELETE FROM ceuTranscriptCustomFields WHERE transcriptID = @transcriptID;
      `)
      .parameter('transcriptID', TYPES.Int, transcriptID)
      .execute();

      // Connect to custom fields table
      if ((config.custom_1 !== 0 || config.custom_2 !== 0) && transcriptID) {
        if (config.custom_1) {
          await connection.sql(`
            USE ${dbName};
            INSERT INTO ceuTranscriptCustomFields (transcriptID, customFieldID) VALUES (@transcriptID, @customFieldID);
          `)
          .parameter('transcriptID', TYPES.Int, transcriptID)
          .parameter('customFieldID', TYPES.Int, config.custom_1)
          .execute();
        }
        if (config.custom_2) {
          await connection.sql(`
            USE ${dbName};
            INSERT INTO ceuTranscriptCustomFields (transcriptID, customFieldID) VALUES (@transcriptID, @customFieldID);
          `)
          .parameter('transcriptID', TYPES.Int, transcriptID)
          .parameter('customFieldID', TYPES.Int, config.custom_2)
          .execute();
        }
      }

      return transcriptID;
    } catch (error) {
      console.error('Error saving transcript config:', error);
      throw error;
    }
  }

  /**
   * Get transcript template config
   */
  async getTranscriptTemplateConfig(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Check if transcript exists, create default if not
      const transcriptIDResult = await connection.sql(`
        USE ${dbName};
        SELECT TOP 1 transcriptID FROM ceuTranscripts WHERE event_id = @eventID;
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .execute();

      let transcriptID = transcriptIDResult[0]?.transcriptID;

      if (!transcriptID) {
        // Create default config
        const defaultConfig = {
          logoType: 'affiliate',
          showOrgBelowLogo: true,
          orgName: '',
          orgPhone: '',
          orgMobile: 'Organization Number',
          orgContact: '',
          nameInHeader: 1,
          emailInHeader: 1,
          mobileHeader: 1,
          phoneInHeader: 1,
          orgInHeader: 1,
          orgInHostDetails: 1,
          orgContactInHostDetails: 1,
          orgPhoneInHostDetails: 1,
          showColDate: 1,
          showColEvent: 1,
          showColSession: 1,
          showColCategory: 1,
          showColCode: 1,
          showColVal: 1,
          showColCheckInOut: 1,
          langBlock: '',
          custom_1: 0,
          custom_2: 0
        };
        transcriptID = await this.saveTranscriptConfig(eventID, defaultConfig, vert);
      }

      // Get config
      const configResult = await connection.sql(`
        USE ${dbName};
        SELECT ct.*, e._guid, e.ceuValueLabel, e.ceuAcronym 
        FROM ceuTranscripts ct
        LEFT JOIN b_events e on e.event_id = ct.event_id
        WHERE ct.event_id = @eventID;
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .execute();

      if (!configResult || !configResult.length) {
        return {};
      }

      const config = configResult[0];

      // Get custom fields
      const customFieldsResult = await connection.sql(`
        USE ${dbName};
        SELECT cf.fieldLabel as label, '[value]' as value, ctf.customFieldID 
        FROM ceuTranscriptCustomFields ctf
        LEFT JOIN custom_fields cf on cf.field_id = ctf.customFieldID
        WHERE transcriptID = @transcriptID;
      `)
      .parameter('transcriptID', TYPES.Int, config.transcriptID)
      .execute();

      config['custom_1'] = customFieldsResult[0] ? customFieldsResult[0].customFieldID : 0;
      config['custom_2'] = customFieldsResult[1] ? customFieldsResult[1].customFieldID : 0;
      config['custom_field_1'] = customFieldsResult[0] || null;
      config['custom_field_2'] = customFieldsResult[1] || null;

      // TODO: Get event data for logo and affiliate info
      // This would require EventService.getEventDataByGUID

      return config;
    } catch (error) {
      console.error('Error getting transcript template config:', error);
      throw error;
    }
  }
}

export default CreditsService;
