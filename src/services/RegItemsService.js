/**
 * Registration Items Service
 * Migrated from Mantle RegItemsService.js
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { getRegItemsByEventID, updateRegItem } from '../functions/regItems.js';

class RegItemsService {
  /**
   * Get event fees by event
   */
  async getEventFeesByEvent(eventID, query, vert) {
    try {
      let eventItems = await getRegItemsByEventID(eventID, null, vert);

      // If includeCEU is in the request query, grab CEUs and add to the reg item objects
      if (query && 'includeCEU' in query) {
        const ids = eventItems.map(item => item.eventFeeID);
        const categoryLinks = await this.getRegItemCEUs(ids, vert);
        eventItems = eventItems.map(item => {
          item['creditCategories'] = categoryLinks[item.eventFeeID] || [];
          return item;
        });
      }

      return eventItems;
    } catch (error) {
      console.error('Error getting event fees by event:', error);
      throw error;
    }
  }

  /**
   * Get reg item CEUs
   */
  async getRegItemCEUs(eventFeeIDs, vert) {
    if (!eventFeeIDs || !eventFeeIDs.length) {
      return {};
    }

    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      const result = await request.query(`
        USE ${dbName};
        SELECT 
            cc.ceuID,
            cc.ceuCategory AS category,
            cc.ceuCode AS code,
            cc.ceuDescription AS description,
            cef.ceuEventFeeID,
            cef.ceuValue AS value,
            cef.eventFeeID,
            (
                SELECT 
                    efb.bundle_name AS name, 
                    cp.bundle_id AS id
                FROM ceu_profiles cp
                LEFT JOIN event_fee_bundles efb ON efb.bundle_id = cp.bundle_id
                WHERE cp.ceuID = cc.ceuID
                FOR JSON PATH
            ) AS profiles
        FROM ceu_event_fees cef
        LEFT JOIN ceu_categories cc ON cc.ceuID = cef.ceuID 
            AND ISNULL(cc.archived, 0) = 0
        WHERE cef.eventFeeID IN (${eventFeeIDs.join(',')})
      `);
      const categories = result.recordset;

      return categories.reduce((acc, curr) => {
        curr.profiles = curr.profiles ? JSON.parse(curr.profiles) : [];
        return {
          ...acc,
          [curr.eventFeeID]: [...(acc[curr.eventFeeID] || []), curr]
        };
      }, {});
    } catch (error) {
      console.error('Error getting reg item CEUs:', error);
      throw error;
    }
  }

  /**
   * Check CE availability
   */
  async checkCeAvailability(ceuEventFeeID, eventFeeID, ceuID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('eventFeeID', sql.Int, Number(eventFeeID));
      request.input('ceuID', sql.Int, Number(ceuID));
      if (ceuEventFeeID) {
        request.input('ceuEventFeeID', sql.Int, Number(ceuEventFeeID));
      }

      const qryStr = `
        USE ${dbName};
        SELECT TOP 1 *
        FROM ceu_event_fees
        WHERE eventFeeID = @eventFeeID
            AND ceuID = @ceuID
            ${ceuEventFeeID ? 'AND ceuEventFeeID != @ceuEventFeeID' : ''}
      `;
      const result = await request.query(qryStr);
      const results = result.recordset;
      return results.length === 0;
    } catch (error) {
      console.error('Error checking CE availability:', error);
      throw error;
    }
  }

  /**
   * Update event fee
   */
  async updateEventFee(eventFeeID, body, vert) {
    try {
      return await updateRegItem(eventFeeID, body, vert);
    } catch (error) {
      console.error('Error updating event fee:', error);
      throw error;
    }
  }

  /**
   * Delete reg item CEU
   */
  async deleteRegItemCEU(ceuEventFeeID, vert) {
    try {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const request = new sql.Request();
      request.input('ceuEventFeeID', sql.Int, Number(ceuEventFeeID));
      await request.query(`
        USE ${dbName};
        DELETE FROM ceu_event_fees 
        WHERE ceuEventFeeID = @ceuEventFeeID
      `);

      return { success: true };
    } catch (error) {
      console.error('Error deleting reg item CEU:', error);
      throw error;
    }
  }

  /**
   * Update reg item CEU
   */
  async updateRegItemCEU(body, ceuEventFeeID, vert) {
    try {
      const { value, ceuID, eventFeeID } = body;
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const ceAvailable = await this.checkCeAvailability(ceuEventFeeID, eventFeeID, ceuID, vert);

      if (!ceAvailable) {
        return {
          success: false,
          message: 'This CE is already assigned to this registration item.'
        };
      }

      const request = new sql.Request();
      request.input('ceuEventFeeID', sql.Int, Number(ceuEventFeeID));
      request.input('value', sql.Float, Number(value));
      request.input('ceuID', sql.Int, Number(ceuID));
      await request.query(`
        USE ${dbName};
        UPDATE ceu_event_fees
        SET ceuValue = @value, ceuID = @ceuID
        WHERE ceuEventFeeID = @ceuEventFeeID
      `);

      return { success: true };
    } catch (error) {
      console.error('Error updating reg item CEU:', error);
      throw error;
    }
  }

  /**
   * Add reg item CEU
   */
  async addRegItemCeu(body, eventFeeID, vert) {
    try {
      const { value, ceuID } = body;
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const ceAvailable = await this.checkCeAvailability(null, eventFeeID, ceuID, vert);

      if (!ceAvailable) {
        return {
          success: false,
          message: 'This CE is already assigned to this registration item.'
        };
      }

      const request = new sql.Request();
      request.input('eventFeeID', sql.Int, Number(eventFeeID));
      request.input('value', sql.Float, Number(value));
      request.input('ceuID', sql.Int, Number(ceuID));
      const result = await request.query(`
        USE ${dbName};
        INSERT INTO ceu_event_fees (
            eventFeeID,
            ceuID,
            ceuValue
        ) VALUES (
            @eventFeeID,
            @ceuID,
            @value
        );
        SELECT @@identity as id
      `);

      const id = result.recordset[0].id;
      const ceus = await this.getRegItemCEUs([eventFeeID], vert);
      const ceuList = ceus[eventFeeID] || [];

      return {
        success: true,
        added: ceuList.find(ceu => ceu.ceuEventFeeID == id)
      };
    } catch (error) {
      console.error('Error adding reg item CEU:', error);
      throw error;
    }
  }

  /**
   * Clear check-in/out codes
   */
  async clearCheckInOutCodes(eventID, body, vert) {
    try {
      // Validate input
      if (!eventID) {
        return { success: false, message: 'No event ID provided' };
      }
      if (!body.ids || !body.ids.length) {
        return { success: false, message: 'No Reg Item IDs provided' };
      }
      if (!body.fields || (!body.fields.includes('in') && !body.fields.includes('out'))) {
        return { success: false, message: "Fields array must include 'in' or 'out'." };
      }

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Build update fields
      const updates = [];
      if (body.fields && body.fields.includes('in')) {
        updates.push("checkInCode = ''");
      }
      if (body.fields && body.fields.includes('out')) {
        updates.push("checkOutCode = ''");
      }

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));
      await request.query(`
        USE ${dbName};
        UPDATE event_fees
        SET ${updates.join(', ')}
        WHERE eventFeeID IN (${body.ids.join(',')})
            AND event_id = @eventID
      `);

      return { success: true };
    } catch (error) {
      console.error('Error clearing check-in/out codes:', error);
      throw error;
    }
  }

  /**
   * Generate check-in/out codes
   */
  async generateCheckInOutCodes(eventID, body, vert) {
    try {
      // Validate input
      if (!eventID) {
        return { success: false, message: 'No event ID provided' };
      }
      if (!body.ids || !body.ids.length) {
        return { success: false, message: 'No Reg Item IDs provided' };
      }
      if (!body.fields || (!body.fields.includes('in') && !body.fields.includes('out'))) {
        return { success: false, message: "Fields array must include 'in' or 'out'." };
      }

      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      let qryString = `USE ${dbName}; `;
      const updateValues = [];

      body.ids.forEach((id, index) => {
        const params = { id, index };

        const updates = [];
        if (body.fields && body.fields.includes('in')) {
          params.checkin = (Math.floor(Math.random() * 99999) + 10000).toString();
          updates.push(`checkInCode = @checkin${Number(index)}`);
        }
        if (body.fields && body.fields.includes('out')) {
          params.checkout = (Math.floor(Math.random() * 99999) + 10000).toString();
          updates.push(`checkOutCode = @checkout${Number(index)}`);
        }

        updateValues.push(params);
        qryString += `
          UPDATE event_fees 
          SET ${updates.join(', ')}
          WHERE eventFeeID = @fee${Number(index)}
              AND event_id = @eventID;
        `;
      });

      const request = new sql.Request();
      request.input('eventID', sql.Int, Number(eventID));

      // Add parameters to the query
      updateValues.forEach(param => {
        if (param.checkin) {
          request.input(`checkin${param.index}`, sql.VarChar, param.checkin.toString());
        }
        if (param.checkout) {
          request.input(`checkout${param.index}`, sql.VarChar, param.checkout.toString());
        }
        request.input(`fee${param.index}`, sql.Int, param.id);
      });

      await request.query(qryString);

      return {
        updates: updateValues.reduce((acc, curr) => {
          acc[curr.id] = {};
          if (curr.checkin) acc[curr.id].checkin = curr.checkin;
          if (curr.checkout) acc[curr.id].checkout = curr.checkout;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Error generating check-in/out codes:', error);
      throw error;
    }
  }
}

export default new RegItemsService();

