/**
 * Custom Fields Service
 * Migrated from Mantle CustomFieldsService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

class CustomFieldsService {
  /**
   * Save changes
   * Updates all events in MongoDB that use this custom field with the latest field definition from MSSQL
   */
  async saveChanges(affiliateID, fieldID, vert) {
    try {
      const db = await getDatabase(null, vert);
      const eventsCollection = db.collection('events');
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Get events from MongoDB that use this question
      const eventsWithQuestion = await eventsCollection.find(
        { 'eq.fi': Number(fieldID) },
        { projection: { _id: 0, e: 1, eq: 1, eqo: 1 } }
      ).toArray();

      // Get the updated question from MSSQL
      const updatedQuestionResults = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT
            RTRIM(LTRIM( cf.fieldLabel )) AS fl,
            cf.field_id AS fi,
            CASE WHEN ( cf.fieldInput != 'text' ) THEN 1 ELSE 0 END AS fo,
            ISNULL( cf.travelField, 0 ) AS tf,
            cf.fieldInput AS ft,
            cf.fieldExportID AS fx,
            cf.optAttribute AS foa,
            cf.groupType AS fg,
            cf.hideFromCharts AS fh,
            JSON_QUERY((SELECT
                '[' + STUFF( (
                    SELECT
                        ',' + CAST( bundle_id AS VARCHAR(32) )
                    FROM
                        b_events_to_custom_fields ecf JOIN b_events e ON
                        ecf.event_id = e.event_id
                    WHERE
                        field_id = @fieldID
                    AND
                        ISNULL(bundle_id,0) > 0
                    AND
                        e.affiliate_id = @affiliateID
                    FOR XML PATH ('')
                ), 1, 1, '') + ']')) AS pfi
        FROM Custom_Fields AS cf
        WHERE cf.field_id = @fieldID
      `)
      .parameter('fieldID', TYPES.Int, fieldID)
      .parameter('affiliateID', TYPES.Int, affiliateID)
      .execute();

      const updatedQuestion = updatedQuestionResults[0];

      // Get options from MSSQL
      const options = await connection.sql(`
        USE ${dbName};
        SELECT
            o.[field_ID] AS fid,
            o.optionLabel AS ol,
            o.optionValue AS ov,
            o.optionOrder AS oo,
            o.[option_id] AS id,
            ISNULL( f.affiliate_id, 0 ) AS a
        FROM
            dbo.[Custom_Fields] AS f
            JOIN dbo.[custom_fieldOptions] AS o ON f.[field_id] = o.[field_ID]
        WHERE f.field_ID = @fieldID
        ORDER BY o.field_ID, ISNULL( o.optionOrder, 999 ), o.optionValue
      `)
      .parameter('fieldID', TYPES.Int, fieldID)
      .execute();

      // Parse the profile array, which comes back as a JSON string
      if (updatedQuestion && updatedQuestion.pfi) {
        updatedQuestion.pfi = JSON.parse(updatedQuestion.pfi);
      }

      // Prepare bulk operations
      const bulkOps = eventsWithQuestion.map(event => {
        const eq = event.eq || [];
        const eqo = event.eqo || [];

        // Filter out old options for this field and add new ones
        const updatedOptions = eqo
          .filter(option => Number(option.fid) !== fieldID)
          .concat(options);

        // Update the question in the eq array
        const updatedQuestions = eq.map(question => {
          if (question && question.fi && Number(question.fi) === Number(fieldID)) {
            return updatedQuestion;
          }
          return question;
        });

        return {
          updateOne: {
            filter: { e: event.e },
            update: {
              $set: {
                lu: new Date(),
                eqo: updatedOptions,
                eq: updatedQuestions
              }
            }
          }
        };
      });

      // Execute bulk operations
      let mongoData = null;
      if (bulkOps.length > 0) {
        mongoData = await eventsCollection.bulkWrite(bulkOps);
      }

      return { status: 'success', data: mongoData };
    } catch (error) {
      console.error('Error saving custom field changes:', error);
      throw error;
    }
  }

  /**
   * Get custom fields by event
   */
  async getCustomFieldsByEvent(eventID, vert) {
    try {
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      const fields = await connection.sql(`
        USE ${dbName};
        SELECT DISTINCT cf.*
        FROM b_events_to_custom_fields etc
        JOIN Custom_Fields cf on cf.field_id = etc.field_id
        WHERE etc.event_id = @eventID
            AND cf.active = 1
      `)
      .parameter('eventID', TYPES.Int, eventID)
      .execute();

      return fields;
    } catch (error) {
      console.error('Error getting custom fields by event:', error);
      throw error;
    }
  }
}

export default new CustomFieldsService();

