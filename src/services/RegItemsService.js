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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const categories = await connection.sql(`
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
      `)
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      let query = connection.sql(`
        USE ${dbName};
        SELECT TOP 1 *
        FROM ceu_event_fees
        WHERE eventFeeID = @eventFeeID
            AND ceuID = @ceuID
            ${ceuEventFeeID ? 'AND ceuEventFeeID != @ceuEventFeeID' : ''}
      `)
      .parameter('eventFeeID', TYPES.Int, Number(eventFeeID))
      .parameter('ceuID', TYPES.Int, Number(ceuID));

      if (ceuEventFeeID) {
        query = query.parameter('ceuEventFeeID', TYPES.Int, Number(ceuEventFeeID));
      }

      const results = await query.execute();
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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      await connection.sql(`
        USE ${dbName};
        DELETE FROM ceu_event_fees 
        WHERE ceuEventFeeID = @ceuEventFeeID
      `)
      .parameter('ceuEventFeeID', TYPES.Int, Number(ceuEventFeeID))
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const ceAvailable = await this.checkCeAvailability(ceuEventFeeID, eventFeeID, ceuID, vert);

      if (!ceAvailable) {
        return {
          success: false,
          message: 'This CE is already assigned to this registration item.'
        };
      }

      await connection.sql(`
        USE ${dbName};
        UPDATE ceu_event_fees
        SET ceuValue = @value, ceuID = @ceuID
        WHERE ceuEventFeeID = @ceuEventFeeID
      `)
      .parameter('ceuEventFeeID', TYPES.Int, Number(ceuEventFeeID))
      .parameter('value', TYPES.Float, Number(value))
      .parameter('ceuID', TYPES.Int, Number(ceuID))
      .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const ceAvailable = await this.checkCeAvailability(null, eventFeeID, ceuID, vert);

      if (!ceAvailable) {
        return {
          success: false,
          message: 'This CE is already assigned to this registration item.'
        };
      }

      const results = await connection.sql(`
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
      `)
      .parameter('eventFeeID', TYPES.Int, Number(eventFeeID))
      .parameter('value', TYPES.Float, Number(value))
      .parameter('ceuID', TYPES.Int, Number(ceuID))
      .execute();

      const id = results[0].id;
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

      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Build update fields
      const updates = [];
      if (body.fields && body.fields.includes('in')) {
        updates.push("checkInCode = ''");
      }
      if (body.fields && body.fields.includes('out')) {
        updates.push("checkOutCode = ''");
      }

      await connection.sql(`
        USE ${dbName};
        UPDATE event_fees
        SET ${updates.join(', ')}
        WHERE eventFeeID IN (${body.ids.join(',')})
            AND event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, Number(eventID))
      .execute();

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

      const connection = await getConnection(vert);
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

      let updateQry = connection.sql(qryString);

      // Add parameters to the query
      updateValues.forEach(param => {
        if (param.checkin) {
          updateQry = updateQry.parameter(`checkin${param.index}`, TYPES.VarChar, param.checkin.toString());
        }
        if (param.checkout) {
          updateQry = updateQry.parameter(`checkout${param.index}`, TYPES.VarChar, param.checkout.toString());
        }
        updateQry = updateQry.parameter(`fee${param.index}`, TYPES.Int, param.id);
      });

      await updateQry
        .parameter('eventID', TYPES.Int, Number(eventID))
        .execute();

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

