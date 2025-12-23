/**
 * Table Assigner Service
 * Migrated from Mantle TableAssigner.js
 */

import { getDatabase } from '../utils/mongodb.js';

class TableAssignerService {
  /**
   * Insert table assigner config
   */
  async insertTableAssignerConfig(params, body) {
    try {
      if (!body) {
        return { status: 'success', insertedID: null };
      }

      const vert = params.vert;
      const db = await getDatabase(null, vert);
      const tableAssignerConfig = db.collection('tableAssignerConfig');

      // Set up other pieces of data
      const data = {
        ...body,
        archived: 0
      };

      const result = await tableAssignerConfig.insertOne(data);
      return {
        status: 'success',
        insertedID: result.insertedId
      };
    } catch (error) {
      console.error('Error inserting table assigner config:', error);
      throw error;
    }
  }

  /**
   * Insert table assigner data
   */
  async insertTableAssignerData(params, body) {
    try {
      if (!body) {
        return { status: 'success', insertedID: null };
      }

      const vert = params.vert;
      const db = await getDatabase(null, vert);
      const tableAssignerData = db.collection('tableAssignerData');

      const result = await tableAssignerData.insertOne(body);
      return {
        status: 'success',
        insertedID: result.insertedId
      };
    } catch (error) {
      console.error('Error inserting table assigner data:', error);
      throw error;
    }
  }

  /**
   * Find table assigner configs by event
   */
  async findTableAssignerConfigsByEvent(params, body) {
    try {
      const vert = params.vert;
      const eventID = Number(params.eventID);
      const db = await getDatabase(null, vert);
      const tableAssignerConfig = db.collection('tableAssignerConfig');

      const configs = await tableAssignerConfig
        .find({ eventID: eventID })
        .toArray();

      return configs;
    } catch (error) {
      console.error('Error finding table assigner configs by event:', error);
      throw error;
    }
  }

  /**
   * Update table assigner config
   */
  async updateTableAssignerConfig(params, body) {
    try {
      if (!body) {
        return { status: 'success' };
      }

      const vert = params.vert;
      const groupingID = params.groupingID;
      const db = await getDatabase(null, vert);
      const tableAssignerConfig = db.collection('tableAssignerConfig');

      await tableAssignerConfig.updateOne(
        { groupingID: groupingID },
        { $set: body }
      );

      return { status: 'success' };
    } catch (error) {
      console.error('Error updating table assigner config:', error);
      throw error;
    }
  }

  /**
   * Update table assigner data
   */
  async updateTableAssignerData(params, body) {
    try {
      if (!body) {
        return { status: 'success' };
      }

      const vert = params.vert;
      const groupingID = params.groupingID;
      const db = await getDatabase(null, vert);
      const tableAssignerData = db.collection('tableAssignerData');

      await tableAssignerData.updateOne(
        { groupingID: groupingID },
        { $set: body }
      );

      return { status: 'success' };
    } catch (error) {
      console.error('Error updating table assigner data:', error);
      throw error;
    }
  }

  /**
   * Find table assigner config
   */
  async findTableAssignerConfig(params) {
    try {
      const vert = params.vert;
      const groupingID = params.groupingID;
      const db = await getDatabase(null, vert);
      const tableAssignerConfig = db.collection('tableAssignerConfig');

      const config = await tableAssignerConfig.findOne({ groupingID: groupingID });
      return config || {};
    } catch (error) {
      console.error('Error finding table assigner config:', error);
      throw error;
    }
  }

  /**
   * Delete table assigner config
   */
  async deleteTableAssignerConfig(params) {
    try {
      const vert = params.vert;
      const groupingID = params.groupingID;
      const db = await getDatabase(null, vert);
      const tableAssignerConfig = db.collection('tableAssignerConfig');

      const result = await tableAssignerConfig.deleteOne({ groupingID: groupingID });
      return {
        status: 'success',
        deletedCount: result.deletedCount
      };
    } catch (error) {
      console.error('Error deleting table assigner config:', error);
      throw error;
    }
  }

  /**
   * Delete table assigner data
   */
  async deleteTableAssignerData(params) {
    try {
      const vert = params.vert;
      const groupingID = params.groupingID;
      const db = await getDatabase(null, vert);
      const tableAssignerData = db.collection('tableAssignerData');

      await tableAssignerData.deleteOne({ groupingID: groupingID });
      return { status: 'success' };
    } catch (error) {
      console.error('Error deleting table assigner data:', error);
      throw error;
    }
  }

  /**
   * Find table assigner data
   */
  async findTableAssignerData(params) {
    try {
      const vert = params.vert;
      const groupingID = params.groupingID;
      const db = await getDatabase(null, vert);
      const tableAssignerData = db.collection('tableAssignerData');

      const data = await tableAssignerData.findOne({ groupingID: groupingID });
      return data || {};
    } catch (error) {
      console.error('Error finding table assigner data:', error);
      throw error;
    }
  }

  /**
   * Find table assigner data by event
   */
  async findTableAssignerDataByEvent(params) {
    try {
      const vert = params.vert;
      const eventID = Number(params.eventID);
      const db = await getDatabase(null, vert);
      const tableAssignerData = db.collection('tableAssignerData');

      const data = await tableAssignerData
        .find({ e: eventID, active: true })
        .toArray();

      return data;
    } catch (error) {
      console.error('Error finding table assigner data by event:', error);
      throw error;
    }
  }

  /**
   * Cancel attendee
   */
  async cancelAttendee(params) {
    try {
      const vert = params.vert;
      const eventID = Number(params.eventID);
      const contestantID = Number(params.contestantID);
      const db = await getDatabase(null, vert);
      const tableAssignerConfig = db.collection('tableAssignerConfig');

      // Find all configs for this event that contain this attendee
      const setupDocs = await tableAssignerConfig
        .find({
          $or: [
            { eventID: eventID },
            { eventID: String(eventID) }
          ],
          'blocks.slots.attendeeData.c': contestantID
        })
        .toArray();

      // Loop through each config document
      for (let i = 0; i < setupDocs.length; i++) {
        // Create a duplicate of this document
        const thisDoc = JSON.parse(JSON.stringify(setupDocs[i]));
        const groupingID = String(thisDoc.groupingID);
        
        // Delete the _id from the doc
        delete thisDoc._id;

        // Loop the blocks and slots in this document
        for (let j = 0; j < thisDoc.blocks.length; j++) {
          const thisBlock = thisDoc.blocks[j];

          // Loop through all the slots in this block
          for (let k = 0; k < thisBlock.slots.length; k++) {
            const thisSlot = thisBlock.slots[k];

            // If we have attendee data for this slot
            if (thisSlot.attendeeData) {
              // Evaluate if it's the correct attendee
              if (Number(thisSlot.attendeeData.c) === contestantID) {
                // Flag it as cancelled
                thisSlot.attendeeData.x = true;
              }
            }
          }
        }

        // Update the document in mongo
        await tableAssignerConfig.updateOne(
          { groupingID: groupingID },
          { $set: thisDoc }
        );
      }

      return { status: 'success' };
    } catch (error) {
      console.error('Error cancelling attendee:', error);
      throw error;
    }
  }
}

export default new TableAssignerService();

