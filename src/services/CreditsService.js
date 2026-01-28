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
import EventService from './EventService.js';
import ejs from 'ejs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import moment from 'moment-timezone';
import _ from 'lodash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('userID', sql.Int, Number(userID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT DISTINCT
          cc.ceuID as id,
          cc.ceuCategory as category,
          cc.ceuCode as code,
          cc.archived
        FROM ceu_categories cc
        WHERE cc.event_id = @eventID
        ORDER BY cc.ceuCategory ASC;
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT DISTINCT c.ceuID, c.ceuCategory 
        FROM ceu_categories c
        LEFT JOIN ceuPackageCategories cpc ON c.ceuID = cpc.ceuID
        JOIN ceu_event_fees cef ON cef.ceuID = c.ceuID
        WHERE c.event_id = @eventID AND c.archived = 0 AND (cpc.packageCatID IS NULL)
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      if (!profiles || !profiles.length) return;

      const values = profiles.map((profile, i) => `(@profileID${i}, @ceuID)`).join(',');
      const request = new sql.Request();
      request.input('ceuID', sql.Int, Number(ceuID));

      profiles.forEach((profile, i) => {
        request.input(`profileID${i}`, sql.Int, profile);
      });

      return await request.query(`
        USE ${dbName};
        INSERT INTO ceu_profiles (bundle_id, ceuID) VALUES ${values};
      `);
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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      if (!states || !states.length) return;

      const values = states.map((state, i) => `(@stateID${i}, @ceuID)`).join(',');
      const request = new sql.Request();
      request.input('ceuID', sql.Int, Number(ceuID));

      states.forEach((state, i) => {
        request.input(`stateID${i}`, sql.Int, state);
      });

      return await request.query(`
        USE ${dbName};
        INSERT INTO ceu_jurisdictions (stateID, ceuID) VALUES ${values};
      `);
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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('name', sql.VarChar, name);
      request.input('code', sql.VarChar, code);
      request.input('eventID', sql.Int, eventID);
      const result = await request.query(`
        USE ${dbName};
        SELECT *
        FROM ceu_categories
        WHERE ceuCategory = @name
          AND ceuCode = @code
          AND event_id = @eventID
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
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
      const request1 = new sql.Request();
      request1.input('ceuID', sql.Int, Number(catID));
      await request1.query(`
        USE ${dbName};
        DELETE FROM ceu_profiles WHERE ceuID = @ceuID;
        DELETE FROM ceu_jurisdictions WHERE ceuID = @ceuID;
      `);

      // Update record
      const request2 = new sql.Request();
      request2.input('ceuID', sql.Int, Number(catID));
      request2.input('name', sql.VarChar, body.name);
      request2.input('description', sql.VarChar, body.description || '');
      request2.input('code', sql.VarChar, body.code);
      await request2.query(`
        USE ${dbName};
        UPDATE ceu_categories
        SET
          ceuCategory = @name,
          ceuDescription = @description,
          ceuCode = @code
        WHERE ceuID = @ceuID;
      `);

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
      const sql = await getConnection(vert);
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
      const request = new sql.Request();
      request.input('name', sql.VarChar, body.name);
      request.input('description', sql.VarChar, body.description || '');
      request.input('code', sql.VarChar, body.code);
      request.input('eventID', sql.Int, Number(body.eventID));
      const result = await request.query(`
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
      `);

      const newID = result.recordset[0]?.id;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('ceuID', sql.Int, Number(catID));
      const result = await request.query(`
        USE ${dbName};
        SELECT *
        FROM ceu_event_fees
        WHERE ceuID = @ceuID;
      `);
      const results = result.recordset;

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

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const archiveCat = body.archived ? 0 : 1;

      const request = new sql.Request();
      request.input('ceuID', sql.Int, Number(catID));
      request.input('archived', sql.Int, Number(archiveCat));
      await request.query(`
        USE ${dbName};
        UPDATE ceu_categories
        SET archived = @archived
        WHERE ceuID = @ceuID;
      `);

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('categoryID', sql.Int, Number(categoryID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('categoryID', sql.Int, Number(categoryID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('categoryID', sql.Int, Number(categoryID));
      const result = await request.query(`
        USE ${dbName};
        SELECT g.grantID
        FROM ceuGrants g
        JOIN ceu_categories cat ON g.event_id = cat.event_id
        JOIN ceuPackageCategories cpc ON cpc.ceuID = cat.ceuID
        WHERE cat.event_id = @eventID AND cat.ceuID = @categoryID
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Loop through categories and check if they are in use
      let inUse = false;
      for (let i = 0; i < categories.length; i++) {
        const catID = categories[i];
        const request = new sql.Request();
        request.input('eventID', sql.Int, Number(eventID));
        request.input('catID', sql.Int, Number(catID));

        if (packageID) {
          request.input('packageID', sql.Int, Number(packageID));
        }

        const result = await request.query(`
          USE ${dbName};
          SELECT DISTINCT c.ceuID, c.ceuCategory 
          FROM ceu_categories c
          JOIN ceuPackageCategories cpc ON c.ceuID = cpc.ceuID
          JOIN ceuPackages p ON cpc.packageID = p.packageID
          WHERE c.event_id = @eventID AND cpc.ceuID = @catID ${packageID ? 'AND NOT p.packageID = @packageID' : ''}
        `);

        if (result.recordset && result.recordset.length > 0) {
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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('packageID', sql.Int, Number(packageID));
      const result = await request.query(`
        USE ${dbName};
        SELECT TOP 1 gl.grantID, gl.runDate
        FROM ceuGrantLog gl
        JOIN ceuGrants g ON g.grantID = gl.grantID
        WHERE g.packageID = @packageID
        ORDER BY gl.runDate DESC
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      if (!categories || !categories.length) return;

      const statements = categories.map((id, i) => `
        INSERT INTO ceuPackageCategories (packageID, ceuID) VALUES (@packageID, @ceuID${i});
      `).join('');

      const request = new sql.Request();
      request.input('packageID', sql.Int, packageID);

      categories.forEach((categoryID, i) => {
        request.input(`ceuID${i}`, sql.Int, categoryID);
      });

      return await request.query(`
        USE ${dbName};
        ${statements}
      `);
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
      const sql = await getConnection(vert);
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

      if ('eventID' in params) {
        sqlQuery += ' AND cp.event_id = @eventID';
      }

      if ('packageID' in params) {
        sqlQuery += ' AND cp.packageID = @packageID';
      }

      sqlQuery += `
        GROUP BY cp.packageID, cp.event_id, cp.packageName, cp.attendanceCriteria, cp.paidInFullRequired, cp.surveyRequired, cc.ceuID, cc.ceuCategory, cc.ceuCode, cc.ceuDescription, cc.archived
      `;

      const request = new sql.Request();
      if ('eventID' in params) {
        request.input('eventID', sql.Int, Number(params.eventID));
      }
      if ('packageID' in params) {
        request.input('packageID', sql.Int, Number(params.packageID));
      }

      const result = await request.query(sqlQuery);
      const data = result.recordset;

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

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Create new package and get new ID
      const request = new sql.Request();
      request.input('eventID', sql.Int, eventID);
      request.input('packageName', sql.VarChar, packageName);
      request.input('attendanceCriteria', sql.TinyInt, attendanceCriteria);
      request.input('paidInFullRequired', sql.Bit, paidInFullRequired);
      request.input('surveyRequired', sql.Bit, surveyRequired);
      const result = await request.query(`
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
      `);

      const newPackageID = result.recordset[0]?.id;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Check if a grant has previously run on this package
      const request1 = new sql.Request();
      request1.input('packageID', sql.Int, packageID);
      const result1 = await request1.query(`
        USE ${dbName};
        SELECT COUNT(*) as count FROM ceuGrants WHERE packageID = @packageID
      `);

      const grantCount = result1.recordset[0]?.count || 0;

      if (grantCount > 0) {
        return {
          success: false,
          message: 'Cannot delete package as it has been used in a grant'
        };
      }

      // Delete package and associated category links
      const request2 = new sql.Request();
      request2.input('eventID', sql.Int, Number(eventID));
      request2.input('packageID', sql.Int, Number(packageID));
      await request2.query(`
        USE ${dbName};
        DELETE FROM ceuPackageCategories WHERE packageID = @packageID;
        DELETE FROM ceuPackages WHERE packageID = @packageID AND event_id = @eventID;
      `);

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

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Edit the existing package
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, eventID);
      request1.input('packageID', sql.Int, packageID);
      request1.input('packageName', sql.VarChar, packageName);
      request1.input('attendanceCriteria', sql.TinyInt, attendanceCriteria);
      request1.input('paidInFullRequired', sql.Bit, paidInFullRequired);
      request1.input('surveyRequired', sql.Bit, surveyRequired);
      await request1.query(`
        USE ${dbName};
        UPDATE ceuPackages
        SET
          packageName = @packageName,
          attendanceCriteria = @attendanceCriteria,
          paidInFullRequired = @paidInFullRequired,
          surveyRequired = @surveyRequired
        WHERE packageID = @packageID
          AND event_id = @eventID
      `);

      // Clear out CE Links so they can be rebuilt
      const request2 = new sql.Request();
      request2.input('packageID', sql.Int, packageID);
      await request2.query(`
        USE ${dbName};
        DELETE FROM ceuPackageCategories WHERE packageID = @packageID;
      `);

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Delete all awarded CEs, declined CEs, grants, grant logs, and exceptions
      // Reset doNotAward flag for all CEs associated with this package
      const request = new sql.Request();
      request.input('packageID', sql.Int, Number(packageID));
      request.input('eventID', sql.Int, Number(eventID));
      await request.query(`
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
      `);

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
      const sql = await getConnection(vert);
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

      const request = new sql.Request();
      request.input('packageID', sql.Int, Number(packageID));

      if ('adminID' in actualFilter) {
        request.input('adminID', sql.Int, Number(actualFilter.adminID));
      }
      if ('categoryID' in actualFilter) {
        request.input('categoryID', sql.Int, Number(actualFilter.categoryID));
      }
      if ('sessionID' in actualFilter) {
        request.input('sessionID', sql.Int, Number(actualFilter.sessionID));
      }

      const result = await request.query(sqlQuery);
      let attendees = result.recordset;

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
      const sql = await getConnection(vert);
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

      const request = new sql.Request();
      request.input('packageID', sql.Int, Number(packageID));

      if ('adminID' in actualFilter) {
        request.input('adminID', sql.Int, Number(actualFilter.adminID));
      }
      if ('categoryID' in actualFilter) {
        request.input('categoryID', sql.Int, Number(actualFilter.categoryID));
      }
      if ('sessionID' in actualFilter) {
        request.input('sessionID', sql.Int, Number(actualFilter.sessionID));
      }

      const result = await request.query(sqlQuery);
      let attendees = result.recordset;

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
      const sql = await getConnection(vert);
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

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('packageID', sql.Int, Number(packageID));
      request.input('categoryID', sql.Int, Number(categoryID));
      request.input('sessionID', sql.Int, Number(sessionID));

      const result = await request.query(sqlQuery);
      let exceptions = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('attendeeID', sql.Int, Number(body.attendeeID));
      request.input('packageID', sql.Int, Number(body.packageID));
      request.input('categoryID', sql.Int, Number(body.categoryID));
      request.input('sessionID', sql.Int, Number(body.sessionID));
      request.input('exceptionText', sql.VarChar, body.exceptionText || '');
      request.input('adminUserID', sql.Int, Number(body.adminUserID));
      const result = await request.query(`
        USE ${dbName};
        INSERT INTO ceuExceptionLog (contestant_id, packageID, categoryID, eventFeeID, exceptionText, adminUserID)
        OUTPUT INSERTED.logID
        VALUES (@attendeeID, @packageID, @categoryID, @sessionID, @exceptionText, @adminUserID)
      `);

      return {
        success: true,
        message: 'Exception added!',
        logID: result.recordset[0]?.logID
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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('logID', sql.Int, Number(logID));
      request.input('exceptionText', sql.VarChar, String(body.exceptionText || ''));
      await request.query(`
        USE ${dbName};
        UPDATE ceuExceptionLog
        SET exceptionText = @exceptionText
        WHERE logID = @logID
      `);

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('logID', sql.Int, Number(logID));
      await request.query(`
        USE ${dbName};
        DELETE FROM ceuExceptionLog WHERE logID = @logID
      `);

      return { success: true };
    } catch (error) {
      console.error('Error removing award exception:', error);
      throw error;
    }
  }

  /**
   * Get sample transcript data for preview/edit mode
   */
  getSampleTranscriptData() {
    return {
      affiliatename: 'Affiliate Name',
      userorg: 'User Organization',
      username: 'User Full Name',
      useremail: 'username@email.com',
      usermobile: '999-999-9999',
      userphone: '999-999-9999',
      orgPhone: '999-999-9999',
      orgContact: 'Contact Name',
      logoType: 'event',
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
      langBlock: 'This is some official text.',
      custom_1: {
        label: 'Custom Field 1',
        value: 12345
      },
      custom_2: {
        label: 'Custom Field 2',
        value: 'Some Value'
      },
      rows: [{
        date: moment.utc().format('MM/DD/YYYY'),
        eventname: 'My Event',
        sessionname: 'Cool Session',
        categoryname: 'Educational',
        code: '12345',
        value: '12.5',
        checkin: moment.utc().format('h:mma'),
        checkout: moment.utc().format('h:mma')
      }, {
        date: moment.utc().format('MM/DD/YYYY'),
        eventname: 'My Event',
        sessionname: 'Cool Session',
        categoryname: 'Educational',
        code: '54321',
        value: '3.0',
        checkin: moment.utc().format('h:mma'),
        checkout: moment.utc().format('h:mma')
      }]
    };
  }

  /**
   * Get transcript template data
   */
  async getTranscriptTemplateData(editMode = false, previewMode = false, eventID, userID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      let data = {};
      let sampleData = this.getSampleTranscriptData();
      let transcriptData = {};

      if (previewMode) {
        sampleData = {
          affiliatename: sampleData.affiliatename,
          userorg: sampleData.userorg,
          username: sampleData.username,
          useremail: sampleData.useremail,
          usermobile: sampleData.usermobile,
          userphone: sampleData.userphone,
          orgName: sampleData.orgName,
          orgPhone: sampleData.orgPhone,
          orgContact: sampleData.orgContact,
          rows: sampleData.rows
        };
      }

      if (!previewMode && !editMode) {
        sampleData = {};
      }

      if (userID) {
        const request = new sql.Request();
        request.input('eventID', sql.Int, Number(eventID));
        request.input('userID', sql.Int, Number(userID));
        const result = await request.query(`
          USE ${dbName};
          SELECT u.user_firstname, u.user_lastname, u.user_email AS useremail, u.user_mobile AS usermobile, u.user_phone AS userphone, a.affiliate_name AS affiliatename, t.orgName, t.orgPhone, t.orgContact, u.user_company AS userorg,
          (SELECT
            gl.runDate AS date,
            ISNULL(CAST(ef.activityStart AS varchar(25)),'') AS sessionDate,
            e.event_title AS eventname, ef.customFeeName AS sessionname, cc.ceuCategory AS categoryname, cc.ceuCode AS code, ceua.ceuValue AS value, cf.checkedIn AS checkin, cf.checkedOut AS checkout
            FROM ceuAwarded ceua
            JOIN ceuGrantLog gl ON gl.logID = ceua.grantLogID
            JOIN event_fees ef ON ef.eventFeeID = ceua.eventFeeID
            JOIN contestant_fees cf ON cf.eventFeeID = ef.eventFeeID
            JOIN eventContestant c ON c.contestant_id = cf.contestant_id AND c.contestant_id = ceua.contestant_id
            JOIN ceu_categories cc ON cc.ceuID = ceua.categoryID
            WHERE ceua.event_id = @eventID and c.user_id = @userID FOR JSON PATH) AS rows
          FROM b_users u
            JOIN b_events e ON e.event_id = @eventID
            JOIN b_affiliates a ON a.affiliate_id = e.affiliate_id
            JOIN ceuTranscripts t ON t.event_id = e.event_id
          WHERE u.user_id = @userID
        `);

        if (result.recordset && result.recordset.length) {
          const formatPhoneNumber = (phoneNumberString) => {
            if (!phoneNumberString) return null;
            const cleaned = ('' + phoneNumberString).replace(/\D/g, '');
            const match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/);
            if (match) {
              const intlCode = (match[1] ? '+1 ' : '');
              return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('');
            }
            return null;
          };

          const row = result.recordset[0];
          row.username = `${row.user_firstname} ${row.user_lastname}`;
          row.userorg = row.userorg ? row.userorg : 'Not Specified';
          row.rows = row.rows ? JSON.parse(row.rows) : [];
          row.rows = row.rows.map(r => {
            r.date = moment.utc(r.date).format('MM/DD/YYYY');
            if (r.sessionDate && r.sessionDate.length > 0) {
              r.sessionDate = moment.utc(r.sessionDate).format('MM/DD/YYYY');
            }
            if (r.checkin) r.checkin = moment.utc(r.checkin).format('h:mma');
            if (r.checkout) r.checkout = moment.utc(r.checkout).format('h:mma');
            return r;
          });
          row.userphone = formatPhoneNumber(row.userphone);
          row.usermobile = formatPhoneNumber(row.usermobile);
          transcriptData = row;
        }
      }

      const actualData = await this.getTranscriptTemplateConfig(eventID, vert);

      // Get user custom fields, if appropriate
      if (userID && actualData.transcriptID) {
        const request = new sql.Request();
        request.input('transcriptID', sql.Int, actualData.transcriptID);
        request.input('userID', sql.Int, Number(userID));
        const customFieldResult = await request.query(`
          USE ${dbName};
          SELECT cf.fieldLabel as label, uc.varcharData as value, ctf.customFieldID 
          FROM ceuTranscriptCustomFields ctf
          LEFT JOIN custom_fields cf on cf.field_id = ctf.customFieldID 
          LEFT JOIN user_custom uc ON cf.field_id = uc.field_id AND uc.field_id = ctf.customFieldID
          WHERE ctf.transcriptID = @transcriptID AND uc.user_id = @userID
        `);

        if (customFieldResult.recordset && customFieldResult.recordset.length > 0) {
          if (customFieldResult.recordset[0]) {
            actualData.custom_field_1 = customFieldResult.recordset[0];
          }
          if (customFieldResult.recordset[1]) {
            actualData.custom_field_2 = customFieldResult.recordset[1];
          }
        }
      }

      data = {
        ...sampleData,
        ...transcriptData,
        ...actualData,
        generatedDate: moment.utc().format('MM/DD/YYYY')
      };

      return data;
    } catch (error) {
      console.error('Error getting transcript template data:', error);
      throw error;
    }
  }

  /**
   * Get transcript template
   */
  async getTranscriptTemplate(edit = false, preview = false, eventID, userID = 0, vert) {
    try {
      const templatePath = join(__dirname, '../../templates/ceu-transcript.ejs');
      const templateData = await this.getTranscriptTemplateData(edit, preview, eventID, userID, vert);
      const html = await ejs.renderFile(templatePath, { ...templateData, editMode: edit });
      return html;
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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get all grants that should be run based on the current date and time
      // Matching old codebase logic: joins with ceuGrantLog to check if grant has already been run
      const request = new sql.Request();
      const result = await request.query(`
        USE ${dbName};
        -- Get all grants that should be run based on the current date and time
        SELECT DISTINCT
          g.grantID,
          g.event_id,
          g.admin_user_id,
          g.packageID,
          g.startDate,
          g.sendTo
        FROM
          ceuGrants g 
          LEFT JOIN ceuGrantLog l ON g.grantID = l.grantID
        WHERE
          g.startDate <= getDate() 
          AND g.archived = 0
        AND
          /*
            Run if runDate is NULL OR runDate is BEFORE the current startDate.
            This is a failsafe in case a grant run is in progress and the cron runs again before it's done.
            The subsequent grant runs will not pick up a grant that has a last run date LATER
            than the NEXT run date.  In that case it would mean a run for that grant is already in progress.
            Once the grant is run, the dates will be set accordingly.
          */
          (l.runDate < g.startDate OR l.runDate IS NULL)
        AND
          g.runType <> 'once'
        ORDER BY g.startDate DESC
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT * FROM ceuGrants WHERE event_id = @eventID AND runType != 'once' AND archived = 0
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('packageID', sql.Int, Number(body.packageID));
      request.input('admin_user_id', sql.Int, Number(body.adminID));
      request.input('certificateTemplateID', sql.Int, body.certificateTemplateID ? Number(body.certificateTemplateID) : null);
      request.input('emailTemplateID', sql.Int, body.emailTemplateID ? Number(body.emailTemplateID) : null);
      request.input('sendTo', sql.Bit, body.emailTemplateID ? Number(body.sendTo) : null);
      request.input('runType', sql.VarChar, body.runType);
      request.input('startDate', sql.DateTime, new Date(body.startDate));
      request.input('testMode', sql.Bit, Number(body.testMode));
      const result = await request.query(`
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
      `);

      const grantResult = {
        success: true,
        message: 'Grant Created',
        grantID: result.recordset[0]?.grantID
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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('grantID', sql.Int, Number(grantID));
      await request.query(`
        USE ${dbName};
        UPDATE ceuGrants
        SET archived = 1
        WHERE event_id = @eventID AND grantID = @grantID
      `);

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const runType = scheduled === "manual" ? "AND g.runType = 'once'" : "AND g.runType != 'once'";

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('logID', sql.Int, Number(logID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const states = await getStates();

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('packageID', sql.Int, Number(packageID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('logID', sql.Int, Number(logID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('logID', sql.Int, Number(logID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('logID', sql.Int, Number(logID));
      request.input('regItemID', sql.Int, Number(itemID));
      request.input('categoryID', sql.Int, Number(catID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      request.input('logID', sql.Int, Number(logID));
      request.input('regItemID', sql.Int, Number(itemID));
      request.input('categoryID', sql.Int, Number(catID));
      const result = await request.query(`
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
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Mark the item as doNotAward for future runs
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, Number(eventID));
      request1.input('awardID', sql.Int, Number(awardID));
      await request1.query(`
        USE ${dbName};
        UPDATE contestant_fees
        SET contestant_fees.doNotAward = 1
        FROM contestant_fees cf
        JOIN ceuAwarded ceua ON cf.eventFeeID = ceua.eventFeeID AND cf.contestant_id = ceua.contestant_id
        JOIN ceu_categories cc ON ceua.categoryID = cc.ceuID
        WHERE ceua.awardID = @awardID AND cf.event_id = @eventID
      `);

      // Delete the award
      const request2 = new sql.Request();
      request2.input('eventID', sql.Int, Number(eventID));
      request2.input('awardID', sql.Int, Number(awardID));
      await request2.query(`
        USE ${dbName};
        DELETE FROM ceuAwarded WHERE event_id = @eventID AND awardID = @awardID
      `);

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      const result = await request.query(`
        USE ${dbName};
        SELECT ef.eventFeeID AS id, ef.customFeeName AS sessionName
        FROM event_fees ef
        WHERE ef.event_id = @eventID AND ISNULL(ef.invisible, 0) = 0
      `);
      const results = result.recordset;

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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, eventID);
      request1.input('logoType', sql.VarChar, config.logoType || '');
      request1.input('showOrgBelowLogo', sql.Bit, config.showOrgBelowLogo ? 1 : 0);
      request1.input('orgName', sql.VarChar, config.orgName || '');
      request1.input('orgPhone', sql.VarChar, config.orgPhone || '');
      request1.input('orgMobile', sql.VarChar, config.orgMobile || '');
      request1.input('orgContact', sql.VarChar, config.orgContact || '');
      request1.input('langBlock', sql.VarChar, config.langBlock || '');
      request1.input('nameInHeader', sql.Bit, config.nameInHeader ? 1 : 0);
      request1.input('emailInHeader', sql.Bit, config.emailInHeader ? 1 : 0);
      request1.input('mobileHeader', sql.Bit, config.mobileHeader ? 1 : 0);
      request1.input('phoneInHeader', sql.Bit, config.phoneInHeader ? 1 : 0);
      request1.input('orgInHeader', sql.Bit, config.orgInHeader ? 1 : 0);
      request1.input('orgInHostDetails', sql.Bit, config.orgInHostDetails ? 1 : 0);
      request1.input('orgContactInHostDetails', sql.Bit, config.orgContactInHostDetails ? 1 : 0);
      request1.input('orgPhoneInHostDetails', sql.Bit, config.orgPhoneInHostDetails ? 1 : 0);
      request1.input('showColDate', sql.Bit, config.showColDate ? 1 : 0);
      request1.input('showColEvent', sql.Bit, config.showColEvent ? 1 : 0);
      request1.input('showColSession', sql.Bit, config.showColSession ? 1 : 0);
      request1.input('showColCategory', sql.Bit, config.showColCategory ? 1 : 0);
      request1.input('showColCode', sql.Bit, config.showColCode ? 1 : 0);
      request1.input('showColVal', sql.Bit, config.showColVal ? 1 : 0);
      request1.input('showColCheckInOut', sql.Bit, config.showColCheckInOut ? 1 : 0);
      const result1 = await request1.query(`
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
      `);

      const transcriptID = result1.recordset[0]?.transcriptID;

      // Delete existing custom field links
      const request2 = new sql.Request();
      request2.input('transcriptID', sql.Int, transcriptID);
      await request2.query(`
        USE ${dbName};
        DELETE FROM ceuTranscriptCustomFields WHERE transcriptID = @transcriptID;
      `);

      // Connect to custom fields table
      if ((config.custom_1 !== 0 || config.custom_2 !== 0) && transcriptID) {
        if (config.custom_1) {
          const request3 = new sql.Request();
          request3.input('transcriptID', sql.Int, transcriptID);
          request3.input('customFieldID', sql.Int, config.custom_1);
          await request3.query(`
            USE ${dbName};
            INSERT INTO ceuTranscriptCustomFields (transcriptID, customFieldID) VALUES (@transcriptID, @customFieldID);
          `);
        }
        if (config.custom_2) {
          const request4 = new sql.Request();
          request4.input('transcriptID', sql.Int, transcriptID);
          request4.input('customFieldID', sql.Int, config.custom_2);
          await request4.query(`
            USE ${dbName};
            INSERT INTO ceuTranscriptCustomFields (transcriptID, customFieldID) VALUES (@transcriptID, @customFieldID);
          `);
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
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Check if transcript exists, create default if not
      const request1 = new sql.Request();
      request1.input('eventID', sql.Int, eventID);
      const result1 = await request1.query(`
        USE ${dbName};
        SELECT TOP 1 transcriptID FROM ceuTranscripts WHERE event_id = @eventID;
      `);

      let transcriptID = result1.recordset[0]?.transcriptID;

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
      const request2 = new sql.Request();
      request2.input('eventID', sql.Int, eventID);
      const result2 = await request2.query(`
        USE ${dbName};
        SELECT ct.*, e._guid, e.ceuValueLabel, e.ceuAcronym 
        FROM ceuTranscripts ct
        LEFT JOIN b_events e on e.event_id = ct.event_id
        WHERE ct.event_id = @eventID;
      `);

      if (!result2.recordset || !result2.recordset.length) {
        return {};
      }

      const config = result2.recordset[0];

      // Get custom fields
      const request3 = new sql.Request();
      request3.input('transcriptID', sql.Int, config.transcriptID);
      const result3 = await request3.query(`
        USE ${dbName};
        SELECT cf.fieldLabel as label, '[value]' as value, ctf.customFieldID 
        FROM ceuTranscriptCustomFields ctf
        LEFT JOIN custom_fields cf on cf.field_id = ctf.customFieldID
        WHERE transcriptID = @transcriptID;
      `);
      const customFieldsResult = result3.recordset;

      config['custom_1'] = customFieldsResult[0] ? customFieldsResult[0].customFieldID : 0;
      config['custom_2'] = customFieldsResult[1] ? customFieldsResult[1].customFieldID : 0;
      config['custom_field_1'] = customFieldsResult[0] || null;
      config['custom_field_2'] = customFieldsResult[1] || null;

      // Get event data for logo and affiliate info
      if (config._guid) {
        const eventData = await EventService.getEventDataByGUID(
          config._guid,
          {
            al3: 1,  // Affiliate logo
            el3: 1,  // Event logo
            an: 1,   // Affiliate name
            ech: 1,  // Event contact header (org name)
            eph: 1,  // Event phone
            em: 1    // Event email
          },
          vert
        );

        if (eventData) {
          // Set affiliate name
          config['affiliatename'] = eventData.an || '';

          // Set logo based on logoType (matching old codebase logic exactly)
          const s3BaseURL = process.env.S3_BASE_URL || 'https://s3-us-west-2.amazonaws.com/eventsquid/';
          
          if (config.logoType === 'event') {
            if (eventData.el3 && eventData.el3.indexOf('https') === 0) {
              config['logo'] = eventData.el3;
            } else if (eventData.el3) {
              // Get vertical config for s3domain
              try {
                const verticalsCollection = await getDatabase(null, 'cm');
                const configVerticalsCollection = verticalsCollection.collection('config-verticals');
                const vertData = await configVerticalsCollection.findOne({ mongoID: String(vert) });
                const s3domain = vertData?.s3domain || '';
                config['logo'] = `${s3BaseURL}${s3domain}/${eventData.el3}`;
              } catch (error) {
                // If we can't get s3domain, use el3 as-is
                config['logo'] = eventData.el3 || '';
              }
            } else {
              // Get vertical config for s3domain (even though we use al3 directly)
              try {
                const verticalsCollection = await getDatabase(null, 'cm');
                const configVerticalsCollection = verticalsCollection.collection('config-verticals');
                await configVerticalsCollection.findOne({ mongoID: String(vert) });
              } catch (error) {
                // Silently continue
              }
              config['logo'] = eventData.al3 || '';
            }
          } else {
            // Affiliate logo
            config['logo'] = eventData.al3 || '';
          }

          // Set org fields if they're empty
          if (!config.orgName) {
            config['orgName'] = eventData.ech ? eventData.ech : (eventData.an || '');
          }
          if (!config.orgPhone) {
            config['orgPhone'] = eventData.eph ? eventData.eph : '';
          }
          if (!config.orgContact) {
            config['orgContact'] = eventData.em ? eventData.em : '';
          }
        }
      }

      return config;
    } catch (error) {
      console.error('Error getting transcript template config:', error);
      throw error;
    }
  }
}

export default CreditsService;
