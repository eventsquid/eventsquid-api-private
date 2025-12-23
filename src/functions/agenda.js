/**
 * Agenda functions
 * Migrated from Mantle functions/agenda
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _ from 'lodash';

/**
 * Toggle sponsor binding to slot
 */
export async function toggleSponsorBinding(eventID, slotID, sponsorID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      IF NOT EXISTS (
          SELECT record_id
          FROM slotSponsor
          WHERE slot_id = @slotID
              AND sponsor_id = @sponsorID
              AND event_id = @eventID
      )
          BEGIN
              INSERT INTO slotSponsor (
                  event_id,
                  slot_id,
                  sponsor_id
              ) VALUES (
                  @eventID,
                  @slotID,
                  @sponsorID
              )
          END
      ELSE
          BEGIN
              DELETE FROM slotSponsor
              WHERE slot_id = @slotID
                  AND sponsor_id = @sponsorID
                  AND event_id = @eventID
          END
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('slotID', TYPES.Int, Number(slotID))
    .parameter('sponsorID', TYPES.Int, Number(sponsorID))
    .execute();

    return 'Agenda Slot Binding Updated';
  } catch (error) {
    console.error('Error toggling sponsor binding:', error);
    throw error;
  }
}

/**
 * Get agenda slots by event ID
 * Note: Uses stored procedure node_getAgendaSlots
 */
export async function getAgendaSlotsByEventID(eventID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    let slots = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_getAgendaSlots @eventID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

    // Format the reviewsOff to a boolean
    slots = slots.map(slot => ({ ...slot, reviewsOff: slot.reviewsOff ? true : false }));

    // Grouping by slotID because there could be duplicates due to group-by on speaker data
    let slotGroups = _.groupBy(slots, 'slot_id');
    slotGroups = _.keys(slotGroups).map(key => slotGroups[key]);

    // Getting the speakers out of the group and combining it with the slot data
    return slotGroups.map(group => {
      const speakers = [];
      group.forEach(slot => {
        if (slot.speaker_id) {
          speakers.push({
            id: slot.speaker_id,
            name: slot.speaker_name,
            reviews: {
              off: slot.speakerReviewsOff ? true : false,
              bundles: slot.bundleIDList ? slot.bundleIDList.split(',').map(id => Number(id)) : [],
              eventFeeIDs: slot.eventFeeIDList ? slot.eventFeeIDList.split(',').map(id => Number(id)) : []
            }
          });
        }
      });

      // Return the slot with the combined speaker data
      const combinedSlot = { ...group[0], speakers };
      // Clean out now un-needed keys
      delete combinedSlot['speaker_id'];
      delete combinedSlot['speaker_name'];
      delete combinedSlot['speakerReviewsOff'];
      delete combinedSlot['bundleIDList'];
      delete combinedSlot['eventFeeIDList'];

      return combinedSlot;
    });
  } catch (error) {
    console.error('Error getting agenda slots by event ID:', error);
    throw error;
  }
}

