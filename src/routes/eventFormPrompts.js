/**
 * Event Form Prompts routes migrated from Mantle eventFormPrompts-controller.js
 * Note: These routes use MSSQL and need MSSQL connection utility
 */

import { requireAuth } from '../middleware/auth.js';
import { requireVertical } from '../middleware/verticalCheck.js';
import { successResponse, errorResponse } from '../utils/response.js';
import _eventService from '../services/EventService.js';

/**
 * GET /eventFormPrompts/:vert/:eventID/:profileID
 * Get all form prompts by Event ID and Profile ID
 * Note: This route uses MSSQL - complex query with grouping and formatting
 */
export const getEventFormPromptsRoute = {
  method: 'GET',
  path: '/eventFormPrompts/:vert/:eventID/:profileID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const vert = request.pathParameters?.vert;
      const eventID = Number(request.pathParameters?.eventID);
      const profileID = Number(request.pathParameters?.profileID);

      const { getConnection, getDatabaseName, TYPES } = await import('../utils/mssql.js');
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Query custom fields
      const qryStr = `
        USE ${dbName};
        SELECT
          c.field_ID,
          c.fieldLabel,
          ISNULL( c.internal, 0 ) AS internal,
          ISNULL( c.validator, '' ) AS validator,
          CONVERT( VARCHAR, etc.maxDate, 101 ) AS maxdate,
          CONVERT( VARCHAR, etc.minDate, 101 ) AS mindate,
          CAST( ISNULL( etc.isRequired, 0 ) AS INT ) AS required,
          RTRIM( LTRIM( c.groupType ) ) AS groupType,
          ISNULL( c.travelField, 0 ) AS travelField,
          'custom' AS fieldType,
          CASE WHEN ( ISNULL( etc.recordID, 0 ) = 0 ) THEN 0 ELSE 1 END AS enabled,
          (
            SELECT COUNT(1)
            FROM custom_FieldsSpawn
            WHERE event_id = @eventID
              AND (
                spawnquestions = cast(c.field_id as varchar)
                OR spawnquestions LIKE cast(c.field_id as varchar) + ',%'
                OR spawnquestions LIKE '%,' + cast(c.field_id as varchar) + ',%'
                OR spawnquestions LIKE '%,' + cast(c.field_id as varchar)
              )
          ) AS spawnFields
        FROM custom_fields c
          LEFT JOIN b_events_to_custom_fields etc ON etc.field_id = c.field_id
            AND ISNULL(etc.bundle_id,0) = @profileID
            AND etc.event_id = @eventID
        WHERE
          c.siteSection = 'user'
          AND c.active = 1
          AND (
            ISNULL(affiliate_id,0) = 0 OR affiliate_id = (
              SELECT affiliate_id
              FROM b_events
              WHERE event_id = @eventID
            )
          )
        GROUP BY
          c.field_ID,
          c.fieldLabel,
          c.internal,
          c.validator,
          etc.maxDate,
          etc.minDate,
          c.promptOrder,
          etc.isRequired,
          c.groupType,
          c.travelField,
          etc.recordID
        ORDER BY
          c.groupType,
          c.promptOrder,
          c.fieldLabel
      `;

      const request = new sql.Request();
      request.input('eventID', sql.Int, eventID);
      request.input('profileID', sql.Int, profileID);
      const result = await request.query(qryStr);
      const customFields = result.recordset;

      // Get event config
      const configResults = await _eventService.getEventConfig(eventID, profileID, vert);
      const configObj = configResults[0] || {};

      // Build standard prompts
      const groupsRA = ['Personal', 'Company', 'Travel'];
      const standardPromptObj = {};

      standardPromptObj['Personal'] = [
        {
          fieldLabel: 'Email',
          id: 'user_email',
          name: 'user_email',
          fieldType: 'standard',
          required: 1,
          groupType: 'Personal',
          forceRequired: 1,
          enabled: 1
        },
        {
          fieldLabel: 'Title',
          id: 'title_req',
          name: 'title_req',
          fieldType: 'standard',
          required: configObj.titlefield_req || 0,
          groupType: 'Personal',
          enabled: configObj.title_req || 0,
          requiredName: 'titlefield_req'
        },
        {
          fieldLabel: 'Full Name',
          id: 'user_full_name',
          name: 'user_full_name',
          fieldType: 'standard',
          required: 1,
          groupType: 'Personal',
          forceRequired: 1,
          enabled: 1
        },
        {
          fieldLabel: 'Suffix',
          id: 'suffix_req',
          name: 'suffix_req',
          fieldType: 'standard',
          required: configObj.suffixfield_req || 0,
          groupType: 'Personal',
          enabled: configObj.suffix_req || 0,
          requiredName: 'suffixfield_req'
        },
        {
          fieldLabel: 'Full Address',
          id: 'address_req',
          name: 'address_req',
          fieldType: 'standard',
          required: configObj.addressfield_req || 0,
          groupType: 'Personal',
          enabled: configObj.address_req || 0,
          requiredName: 'addressfield_req'
        },
        {
          fieldLabel: 'Phone Number',
          id: 'phone_req',
          name: 'phone_req',
          fieldType: 'standard',
          required: configObj.phonefield_req || 0,
          groupType: 'Personal',
          enabled: configObj.phone_req || 0,
          requiredName: 'phonefield_req'
        },
        {
          fieldLabel: 'Mobile Phone Number',
          id: 'mobile_req',
          name: 'mobile_req',
          fieldType: 'standard',
          required: configObj.mobilefield_req || 0,
          groupType: 'Personal',
          enabled: configObj.mobile_req || 0,
          requiredName: 'mobilefield_req'
        },
        {
          fieldLabel: 'Bio',
          id: 'bio_req',
          name: 'bio_req',
          fieldType: 'standard',
          required: configObj.biofield_req || 0,
          groupType: 'Personal',
          enabled: configObj.bio_req || 0,
          requiredName: 'biofield_req'
        },
        {
          fieldLabel: 'Birthdate',
          id: 'birthdate_req',
          name: 'birthdate_req',
          fieldType: 'standard',
          required: configObj.birthdatefield_req || 0,
          groupType: 'Personal',
          enabled: configObj.birthdate_req || 0,
          requiredName: 'birthdatefield_req'
        },
        {
          fieldLabel: 'Social Security No. (encrypted)',
          id: 'ssn_req',
          name: 'ssn_req',
          fieldType: 'standard',
          required: configObj.ssnfield_req || 0,
          groupType: 'Personal',
          enabled: configObj.ssn_req || 0,
          vertical_only: 1,
          vertical: 'Launchsquid',
          requiredName: 'ssnfield_req'
        },
        {
          fieldLabel: 'Gender',
          id: 'gender_req',
          name: 'gender_req',
          fieldType: 'standard',
          required: configObj.genderfield_req || 0,
          groupType: 'Personal',
          enabled: configObj.gender_req || 0,
          requiredName: 'genderfield_req'
        }
      ];

      standardPromptObj['Company'] = [
        {
          fieldLabel: 'Company Name',
          id: 'company_req',
          name: 'company_req',
          fieldType: 'standard',
          required: configObj.companyfield_req || 0,
          corporate_only: 1,
          groupType: 'Company',
          enabled: configObj.company_req || 0,
          requiredName: 'companyfield_req'
        },
        {
          fieldLabel: 'Position/Title',
          id: 'position_req',
          name: 'position_req',
          fieldType: 'standard',
          required: configObj.positionfield_req || 0,
          groupType: 'Company',
          enabled: configObj.position_req || 0,
          requiredName: 'positionfield_req'
        },
        {
          fieldLabel: 'Company Billing Address',
          id: 'companyAddress_req',
          name: 'companyAddress_req',
          fieldType: 'standard',
          required: configObj.companyaddressfield_req || 0,
          groupType: 'Company',
          enabled: configObj.companyaddress_req || 0,
          requiredName: 'companyaddressfield_req'
        },
        {
          fieldLabel: 'Company Shipping Address',
          id: 'companyShipAddress_req',
          name: 'companyShipAddress_req',
          fieldType: 'standard',
          required: configObj.companyshipaddressfield_req || 0,
          groupType: 'Company',
          enabled: configObj.companyshipaddress_req || 0,
          requiredName: 'companyshipaddressfield_req'
        }
      ];

      standardPromptObj['Team'] = [
        {
          fieldLabel: 'Team Name/Initials',
          id: 'team_req',
          name: 'team_req',
          fieldType: 'standard',
          required: configObj.teamfield_req || 0,
          nonCorporate_only: 1,
          groupType: 'Team',
          enabled: configObj.team_req || 0,
          requiredName: 'teamfield_req'
        }
      ];

      standardPromptObj['Travel'] = [
        {
          fieldLabel: 'Travel Method',
          id: 'showTravelMethod',
          name: 'showTravelMethod',
          fieldType: 'standard',
          required: configObj.travelmethodfield_req || 0,
          corporate_only: 1,
          groupType: 'Travel',
          enabled: configObj.showtravelmethod || 0,
          requiredName: 'travelmethodfield_req'
        },
        {
          fieldLabel: 'Departure City',
          id: 'departure_req',
          name: 'departure_req',
          fieldType: 'standard',
          required: configObj.departurefield_req || 0,
          groupType: 'Travel',
          enabled: configObj.departure_req || 0,
          requiredName: 'departurefield_req'
        },
        {
          fieldLabel: 'Room Needed/Type',
          id: 'needroom',
          name: 'needroom',
          fieldType: 'standard',
          required: configObj.needroomfield_req || 0,
          groupType: 'Travel',
          enabled: configObj.needroom || 0,
          options: ['King', 'Queen', 'Two Queens', 'Two Doubles', 'Suite', 'Executive'],
          optionsLabel: 'Offer',
          optionsName: 'roomtypelist',
          selectedOptions: (configObj.roomtypelist || '').split(',').filter(s => s.trim()),
          requiredName: 'needroomfield_req'
        },
        {
          fieldLabel: 'Hotel Check-In/Out Dates',
          id: 'hotelcheckinout',
          name: 'hotelcheckinout',
          fieldType: 'standard',
          required: configObj.hotelcheckinoutfield_req || 0,
          groupType: 'Travel',
          enabled: configObj.hotelcheckinout || 0,
          datePickers: [
            { id: 'mindatehotel', value: configObj.mindatehotel || '' },
            { id: 'maxdatehotel', value: configObj.maxdatehotel || '' }
          ],
          datePickersLabel: 'Restrict to',
          coCondition: 'Conditional upon answer to Room Needed/Type prompt',
          requiredName: 'hotelcheckinoutfield_req'
        },
        {
          fieldLabel: 'Preferred Hotel',
          id: 'hotel_req',
          name: 'hotel_req',
          fieldType: 'standard',
          required: configObj.hotelfield_req || 0,
          groupType: 'Travel',
          enabled: configObj.hotel_req || 0,
          requiredName: 'hotelfield_req'
        }
      ];

      // Process custom fields
      const datePromptsRA = customFields.filter(p => p.validator === '00-00-0000');
      const groupTypesRA = [...new Set(customFields.map(p => p.groupType).filter(Boolean))];
      const allGroupsRA = [...new Set([...groupsRA, ...groupTypesRA])];

      // Add date pickers to date prompts
      datePromptsRA.forEach(prompt => {
        prompt.datePickers = [
          { id: `mindate-${prompt.field_ID}`, value: prompt.mindate || '' },
          { id: `maxdate-${prompt.field_ID}`, value: prompt.maxdate || '' }
        ];
        prompt.datePickersLabel = 'Restrict to';
      });

      // Check for Speaker and Membership groups
      const hasSpeakerGroup = customFields.some(p => p.groupType === 'Speaker');
      const hasMembershipGroup = customFields.some(p => p.groupType === 'Membership');

      if (hasSpeakerGroup) {
        standardPromptObj['Speaker'] = [
          {
            fieldLabel: 'Checkbox for speaker status (allows registration form to handle speaker status)',
            id: 'showIsSpeaker',
            name: 'showIsSpeaker',
            fieldType: 'standard',
            groupType: 'Speaker',
            noRequiredPicker: 1,
            enabled: configObj.showisspeaker || 0
          }
        ];
      }

      if (hasMembershipGroup) {
        standardPromptObj['Membership'] = [
          {
            fieldLabel: `MUST be valid member of affiliate roster on this site (or registration is disallowed)`,
            id: 'memberOfAffiliateID',
            name: 'memberOfAffiliateID',
            fieldType: 'standard',
            groupType: 'Membership',
            noRequiredPicker: 1,
            enabled: configObj.memberofaffiliateid || 0
          }
        ];
      }

      // Group prompts by group type
      const groupedPromptObj = {};
      const groupedPromptRA = [];

      allGroupsRA.forEach(groupType => {
        if (standardPromptObj[groupType]) {
          // For Travel, add custom fields first, then standard
          if (groupType === 'Travel') {
            const travelCustomRA = customFields.filter(p => p.groupType === groupType);
            groupedPromptObj[groupType] = [...travelCustomRA, ...standardPromptObj[groupType]];
          } else {
            // For other groups, add standard first, then custom
            const groupCustomRA = customFields.filter(p => p.groupType === groupType);
            groupedPromptObj[groupType] = [...standardPromptObj[groupType], ...groupCustomRA];
          }
        } else {
          // Only custom fields for this group
          groupedPromptObj[groupType] = customFields.filter(p => p.groupType === groupType);
        }

        groupedPromptRA.push({
          group: String(groupType),
          prompts: groupedPromptObj[groupType]
        });
      });

      return createResponse(200, {
        config: configObj,
        asRA: customFields,
        datePromptsRA: datePromptsRA,
        groups: allGroupsRA,
        groupObj: groupedPromptObj,
        groupedPromptRA: groupedPromptRA
      });
    } catch (error) {
      console.error('Error getting event form prompts:', error);
      return errorResponse('Failed to get event form prompts', 500, error.message);
    }
  }))
};

/**
 * POST /eventFormPrompts/:vert/:eventID/:profileID
 * Save event form prompts
 */
export const saveEventFormPromptsRoute = {
  method: 'POST',
  path: '/eventFormPrompts/:vert/:eventID/:profileID',
  handler: requireAuth(requireVertical(async (request) => {
    try {
      const { fieldType } = request.body || {};
      let returnObj = {};
      
      // If this is a standard prompt
      if (fieldType === 'standard') {
        returnObj = await _eventService.saveEventStandardPrompts(request);
      } else if (fieldType === 'custom') {
        // If it's a custom prompt
        returnObj = await _eventService.saveEventCustomPrompts(request);
      }
      
      return createResponse(200, returnObj);
    } catch (error) {
      console.error('Error saving event form prompts:', error);
      return errorResponse('Failed to save event form prompts', 500, error.message);
    }
  }))
};

