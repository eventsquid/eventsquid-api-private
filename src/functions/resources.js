/**
 * Resources functions
 * Migrated from Mantle functions/resources
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { getRegisteredAttendeeByUserID } from './attendees.js';
import { getMyItinerarySlotsByContestantID } from './agenda.js';

/**
 * Get event resources
 */
export async function getEventResources(eventID, filter, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const filterClause = filter && filter.length 
      ? `AND u.resource_type IN (${filter.map(item => `'${item}'`).join(',')})`
      : '';

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      SELECT
        u.upload_id,
        u.event_id,
        u.filename,
        u.uploadTitle,
        u.uploadType,
        u.filenameS3,
        u.uploadCategory,
        u.sortOrder,
        CASE WHEN EXISTS (
          SELECT 1 FROM emailReminders_attachments era
          INNER JOIN emailReminders er ON er.reminderID = era.reminderID
          WHERE era.attachmentID = u.upload_id
            AND era.type = 'eventDoc'
            AND CAST(er.sendDate AS DATE) > CAST(getDate() AS DATE)
        ) THEN 1 ELSE 0 END as scheduleForAutoReminder,
        CASE
          WHEN u.resource_type IS NULL THEN 'document-upload'
          ELSE u.resource_type
        END AS resource_type,
        u.category_id,
        u.created_date,
        u.deleted,
        u.resource_url,
        u.preview_url,
        u.description,
        u.accessRestriction,
        u.showOnWebsite,
        u.showOnMobile,
        u.showOnVeo,
        u.sponsorID,
        u.linkedLibraryDocID,
        uu.uploadtitle as linkedDocTitle,
        s.affiliate_name AS sponsorName,
        s.defaultSponsorEmail AS sponsorEmail,
        s.affiliate_website,
        (
          SELECT TOP 1 es.level_id
          FROM event_sponsor es
          LEFT JOIN b_sponsorLevels sl ON sl.event_id = es.event_id AND sl.level_id = es.level_id
          WHERE es.sponsorID = s.sponsorID
            AND es.event_id = @eventID
          ORDER BY sl.level_order ASC, sl.level_id DESC
        ) levelID,
        rc.name as categoryName,
        ISNULL((
          SELECT CAST(slot_id as varchar) + ','
          FROM event_resources_to_agenda_slots
          WHERE resource_id = u.upload_id
          FOR XML PATH('')
        ), '') as slots
      FROM eventUploads u
      LEFT JOIN resource_categories rc ON rc.category_id = u.category_id
        AND rc.event_id = @eventID
        AND rc.deleted = 0
      LEFT JOIN b_sponsors s ON u.sponsorID = s.sponsorID
      LEFT JOIN user_uploads uu on uu.doc_id = u.linkedLibraryDocID
      WHERE u.event_id = @eventID
        AND u.deleted = 0
        ${filterClause}
    `);
    const results = result.recordset;

    return results.map(resource => {
      // FOR XML PATH returns comma-separated string with trailing comma, so trim it
      const slotsStr = resource.slots.trim();
      resource.slots = slotsStr.length && slotsStr.endsWith(',')
        ? slotsStr.slice(0, -1).split(',').map(id => Number(id))
        : (slotsStr.length ? slotsStr.split(',').map(id => Number(id)) : []);
      resource.uploadCategory = resource.categoryName;
      resource.linkedDoc = resource.linkedLibraryDocID 
        ? {
            title: resource.linkedDocTitle,
            id: resource.linkedLibraryDocID
          }
        : {};
      delete resource.linkedDocTitle;
      delete resource.linkedLibraryDocID;
      delete resource.categoryName;
      return resource;
    });
  } catch (error) {
    console.error('Error getting event resources:', error);
    throw error;
  }
}

/**
 * Get accessible resources for a user/event
 * Filters resources based on access restrictions, registration status, and slot assignments
 */
export async function getAccessibleResources(filter, userID, eventID, vert) {
  try {
    // Get all event resources
    let resources = await getEventResources(eventID, [], vert);
    
    // Apply filter parameters (showOnWebsite, showOnMobile, showOnVeo)
    // Match old codebase: filter by loose equality (allows type coercion)
    if (filter) {
      for (const key in filter) {
        if (filter.hasOwnProperty(key) && filter[key] !== undefined) {
          resources = resources.filter(r => r[key] == filter[key]);
        }
      }
    }
    
    // If no userID, return public resources only (no access restrictions)
    if (!userID || Number(userID) === 0) {
      return resources.filter(r => {
        const accessRestriction = Number(r.accessRestriction) || 0;
        return accessRestriction === 0 || !r.accessRestriction;
      });
    }
    
    // Get registered attendee to check registration status
    const attendee = await getRegisteredAttendeeByUserID(Number(userID), Number(eventID), vert);
    const isRegistered = !!attendee;
    
    // Get attendee's registered slots if registered (for slot-based filtering)
    // Match old codebase: use getAttendeeAgendaSlots which returns array of slot IDs directly
    let registeredSlotIDs = [];
    if (isRegistered) {
      // Import getAttendeeAgendaSlots dynamically to avoid circular dependency
      const { getAttendeeAgendaSlots } = await import('./attendees.js');
      registeredSlotIDs = await getAttendeeAgendaSlots(attendee.c, vert) || [];
    }
    
    // Filter based on access restrictions
    // Match old codebase behavior exactly: use switch statement with accessRestriction
    resources = resources.filter(resource => {
      // Handle access controls using switch (matching old codebase)
      switch (resource.accessRestriction) {
        // If accessRestriction is 1, must be registered for event
        case 1:
          if (!isRegistered) return false;
          break;
        // If accessRestriction is 2, must be registered for a session this resource is bound to
        case 2:
          // If the user isn't even registered, give em nothing
          if (!isRegistered || !registeredSlotIDs || !registeredSlotIDs.length) return false;
          // Check if any of the slots the user is registered for matches any of the slots this resource is connected to
          // Match old codebase: use indexOf instead of includes, and don't check if slots exists
          if (!registeredSlotIDs.some(id => resource.slots && resource.slots.indexOf(id) >= 0)) return false;
          break;
      }
      
      // All other cases (including accessRestriction 0, null, undefined, or string values) return true
      return true;
    });
    
    return resources;
  } catch (error) {
    console.error('Error getting accessible resources:', error);
    throw error;
  }
}

/**
 * Get event resource categories
 */
export async function getEventResourceCategories(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      SELECT *
      FROM resource_categories
      WHERE event_id = @eventID
          AND deleted = 0
    `);
    const data = result.recordset;

    return data.map(record => ({
      id: record.category_id,
      name: record.name,
      deleted: record.deleted,
      sortOrder: record.sortOrder,
      created: record.created
    }));
  } catch (error) {
    console.error('Error getting event resource categories:', error);
    throw error;
  }
}

/**
 * Get affiliate resources
 */
export async function getAffiliateResources(affiliateID, filter, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const filterClause = filter && filter.length 
      ? `AND u.resource_type IN (${filter.map(item => `'${item}'`).join(',')})`
      : '';

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      SELECT
          u.*,
          rc.name as categoryName,
          CASE WHEN EXISTS (
              SELECT 1 FROM emailReminders_attachments era
              INNER JOIN emailReminders er ON er.reminderID = era.reminderID
              WHERE era.attachmentID = u.doc_id
                  AND era.type = 'affDoc'
                  AND CAST(er.sendDate AS DATE) > CAST(getDate() AS DATE)
          ) THEN 1 ELSE 0 END as scheduleForAutoReminder,
          ISNULL((
              SELECT 
                  eu.event_id as eventID,
                  CAST(e.event_title as varchar ) as title,
                  eu.upload_id as uploadID
              FROM eventUploads eu
              LEFT JOIN b_events e on e.event_id = eu.event_id
              WHERE eu.linkedLibraryDocID = u.doc_id
                  AND ISNULL(eu.deleted, 0 ) = 0
              FOR JSON path
          ), '[]') as linkedTo
      FROM user_uploads u
      LEFT JOIN resource_categories rc ON rc.category_id = u.category_id
          AND rc.affiliate_id = @affiliateID
          AND rc.deleted = 0
      WHERE u.affiliate_id = @affiliateID
          AND u.deleted = 0
          ${filterClause}
    `);
    const results = result.recordset;

    return results.map(resource => {
      resource.linkedTo = JSON.parse(resource.linkedTo || '[]');
      resource.uploadTitle = resource.uploadtitle;
      resource.uploadCategory = resource.categoryName;
      delete resource.categoryName;
      delete resource.uploadtitle;
      return resource;
    });
  } catch (error) {
    console.error('Error getting affiliate resources:', error);
    throw error;
  }
}

/**
 * Get affiliate resource categories
 */
export async function getAffiliateResourceCategories(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      SELECT *
      FROM resource_categories
      WHERE affiliate_id = @affiliateID
          AND deleted = 0
    `);
    const data = result.recordset;

    return data.map(record => ({
      id: record.category_id,
      name: record.name,
      deleted: record.deleted,
      sortOrder: record.sortOrder,
      created: record.created
    }));
  } catch (error) {
    console.error('Error getting affiliate resource categories:', error);
    throw error;
  }
}

/**
 * Add affiliate resource
 */
export async function addAffiliateResource(affiliateID, data, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    let categoryID = null;
    if (data.category && data.category.length) {
      const affiliateCategories = await getAffiliateResourceCategories(affiliateID, vert);
      let matchingCategory = affiliateCategories.find(category => category.name == data.category);

      if (matchingCategory) {
        categoryID = matchingCategory.id;
      } else {
        const newCategory = await createResourceCategory(affiliateID, null, data.category, vert);
        categoryID = newCategory?.category_id || newCategory?.id;
      }
    }

    const categoryClause = categoryID ? 'category_id,' : '';
    const categoryValue = categoryID ? '@categoryID,' : '';

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    request.input('title', sql.VarChar, data.title || '');
    request.input('filename', sql.VarChar, data.filename || '');
    request.input('ext', sql.VarChar, data.ext || '');
    request.input('type', sql.VarChar, data.type || '');
    request.input('url', sql.VarChar, data.url || '');
    request.input('categoryID', sql.Int, categoryID);
    const result = await request.query(`
      USE ${dbName};
      INSERT INTO user_uploads (
          ${categoryClause}
          uploadTitle,
          filename,
          filenameS3,
          uploadtype,
          affiliate_id,
          resource_type,
          resource_url
      )
      VALUES (
          ${categoryValue}
          @title,
          @filename,
          @filename,
          @ext,
          @affiliateID,
          @type,
          @url
      );
      SELECT SCOPE_IDENTITY() AS id;
    `);

    return result.recordset[0]?.id;
  } catch (error) {
    console.error('Error adding affiliate resource:', error);
    throw error;
  }
}

/**
 * Update affiliate resource
 */
export async function updateAffiliateResource(affiliateID, uploadID, field, value, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const getUpdateData = (field) => {
      switch (field) {
        case 'uploadTitle':
          return { type: sql.VarChar, fieldName: 'uploadTitle' };
        case 'description':
          return { type: sql.VarChar, fieldName: 'description' };
        case 'resource_url':
          return { type: sql.VarChar, fieldName: 'resource_url' };
        case 'preview_url':
          return { type: sql.VarChar, fieldName: 'preview_url' };
        case 'category_id':
          return { type: sql.Int, fieldName: 'category_id' };
        case 'resource_type':
          return { type: sql.VarChar, fieldName: 'resource_type' };
        default:
          throw new Error(`Unknown field: ${field}`);
      }
    };

    const { fieldName, type } = getUpdateData(field);

    const request = new sql.Request();
    request.input('uploadID', sql.Int, Number(uploadID));
    request.input('affiliateID', sql.Int, Number(affiliateID));
    request.input('value', type, value);
    await request.query(`
      USE ${dbName};
      UPDATE user_uploads
      SET ${fieldName} = @value
      WHERE doc_id = @uploadID
          AND affiliate_id = @affiliateID
    `);

    return 'Updated Resource';
  } catch (error) {
    console.error('Error updating affiliate resource:', error);
    throw error;
  }
}

/**
 * Delete affiliate resource
 */
export async function deleteAffiliateResource(affiliateID, uploadID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('uploadID', sql.Int, Number(uploadID));
    request.input('affiliateID', sql.Int, Number(affiliateID));
    await request.query(`
      USE ${dbName};
      UPDATE user_uploads SET deleted = 1 WHERE doc_id = @uploadID AND affiliate_id = @affiliateID;
      UPDATE eventUploads SET linkedLibraryDocID = NULL WHERE linkedLibraryDocID = @uploadID;
    `);

    return 'Deleted resource from affiliate';
  } catch (error) {
    console.error('Error deleting affiliate resource:', error);
    throw error;
  }
}

/**
 * Get linked resources by affiliate
 */
export async function getLinkedResourcesByAffiliate(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      SELECT * 
      FROM eventUploads 
      WHERE 
          linkedLibraryDocID IN (
              SELECT doc_id FROM user_uploads WHERE affiliate_id = @affiliateID AND deleted = 0
          ) 
          AND deleted = 0
    `);
    const results = result.recordset;

    return results;
  } catch (error) {
    console.error('Error getting linked resources by affiliate:', error);
    throw error;
  }
}

/**
 * Create resource category
 */
export async function createResourceCategory(affiliate_id, event_id, name, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    if (affiliate_id !== null) {
      affiliate_id = Number(affiliate_id) === 0 ? 1 : Number(affiliate_id);
    }

    const request = new sql.Request();
    request.input('affiliate_id', sql.Int, affiliate_id);
    request.input('event_id', sql.Int, Number(event_id || 0));
    request.input('name', sql.VarChar, String(name));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_resourceCategoryAdd
          @affiliate_id,
          @event_id,
          @name
    `);

    return result.recordset[0];
  } catch (error) {
    console.error('Error creating resource category:', error);
    throw error;
  }
}

/**
 * Update resource category
 */
export async function updateResourceCategory(category_id, name, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('category_id', sql.Int, Number(category_id));
    request.input('name', sql.VarChar, String(name));
    await request.query(`
      USE ${dbName};
      EXEC dbo.node_resourceCategoryUpdate
          @category_id,
          @name
    `);

    return { status: 'success' };
  } catch (error) {
    console.error('Error updating resource category:', error);
    throw error;
  }
}

/**
 * Delete affiliate resource category
 */
export async function deleteAffiliateResourceCategory(affiliate_id, category_id, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliate_id', sql.Int, Number(affiliate_id));
    request.input('category_id', sql.Int, Number(category_id));
    await request.query(`
      USE ${dbName};
      UPDATE resource_categories
      SET deleted = 1
      WHERE affiliate_id = @affiliate_id
          AND category_id = @category_id;
      UPDATE user_uploads SET category_id = NULL WHERE category_id = @category_id;
    `);

    return { status: 'success' };
  } catch (error) {
    console.error('Error deleting affiliate resource category:', error);
    throw error;
  }
}

/**
 * Update event resource
 */
export async function updateEventResource(eventID, uploadID, field, value, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const getUpdateData = (field) => {
      switch (field) {
        case 'uploadTitle':
          return { type: sql.VarChar, fieldName: 'uploadTitle' };
        case 'description':
          return { type: sql.VarChar, fieldName: 'description' };
        case 'resource_url':
          return { type: sql.VarChar, fieldName: 'resource_url' };
        case 'preview_url':
          return { type: sql.VarChar, fieldName: 'preview_url' };
        case 'category_id':
          return { type: sql.Int, fieldName: 'category_id' };
        case 'sortOrder':
          return { type: sql.Int, fieldName: 'sortOrder' };
        case 'resource_type':
          return { type: sql.VarChar, fieldName: 'resource_type' };
        case 'showOnWebsite':
          return { type: sql.Bit, fieldName: 'showOnWebsite' };
        case 'showOnMobile':
          return { type: sql.Bit, fieldName: 'showOnMobile' };
        case 'showOnVeo':
          return { type: sql.Bit, fieldName: 'showOnVeo' };
        case 'accessRestriction':
          return { type: sql.Int, fieldName: 'accessRestriction' };
        case 'linkedLibraryDocID':
          return { type: sql.Int, fieldName: 'linkedLibraryDocID' };
        case 'deleted':
          return { type: sql.Bit, fieldName: 'deleted' };
        case 'filename':
          return { type: sql.VarChar, fieldName: 'filename' };
        case 'filenameS3':
          return { type: sql.VarChar, fieldName: 'filename' };
        default:
          throw new Error(`Unknown field: ${field}`);
      }
    };

    const { fieldName, type } = getUpdateData(field);
    const filenameUpdate = fieldName === 'filename' ? ',filenameS3 = @value' : '';

    const request = new sql.Request();
    request.input('uploadID', sql.Int, Number(uploadID));
    request.input('eventID', sql.Int, Number(eventID));
    request.input('value', type, value);
    await request.query(`
      USE ${dbName};
      UPDATE eventUploads
      SET ${fieldName} = @value${filenameUpdate}
      WHERE upload_id = @uploadID
          AND event_id = @eventID
    `);

    return 'Updated Resource';
  } catch (error) {
    console.error('Error updating event resource:', error);
    throw error;
  }
}

/**
 * Delete event resource
 */
export async function deleteEventResource(eventID, uploadID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('uploadID', sql.Int, Number(uploadID));
    request.input('eventID', sql.Int, Number(eventID));
    await request.query(`
      USE ${dbName};
      UPDATE eventUploads SET deleted = 1 WHERE upload_id = @uploadID AND event_id = @eventID;
    `);

    return 'Deleted resource from event';
  } catch (error) {
    console.error('Error deleting event resource:', error);
    throw error;
  }
}

/**
 * Get resource sponsors
 */
export async function getResourceSponsors(affiliate_id, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliate_id', sql.Int, Number(affiliate_id));
    const result = await request.query(`
      USE ${dbName};
      EXEC dbo.node_getResourceSponsors @affiliate_id
    `);

    return result.recordset;
  } catch (error) {
    console.error('Error getting resource sponsors:', error);
    throw error;
  }
}

/**
 * Add event resource
 */
export async function addEventResource(eventID, data, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    let categoryID = null;
    if (data.category && data.category.length) {
      const eventCategories = await getEventResourceCategories(eventID, vert);
      let matchingCategory = eventCategories.find(category => category.name == data.category);

      if (matchingCategory) {
        categoryID = matchingCategory.id;
      } else {
        const newCategory = await createResourceCategory(null, eventID, data.category, vert);
        categoryID = newCategory?.category_id || newCategory?.id;
      }
    }

    const categoryClause = categoryID ? 'category_id,' : '';
    const categoryValue = categoryID ? '@categoryID,' : '';
    const linkedClause = 'linkedID' in data ? 'linkedLibraryDocID,' : '';
    const linkedValue = 'linkedID' in data ? '@linkedID,' : '';

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    request.input('title', sql.VarChar, data.title || '');
    request.input('filename', sql.VarChar, data.filename || '');
    request.input('ext', sql.VarChar, data.ext || '');
    request.input('type', sql.VarChar, data.type || '');
    request.input('url', sql.VarChar, data.url || '');
    if (categoryID) {
      request.input('categoryID', sql.Int, categoryID);
    }
    if ('linkedID' in data) {
      request.input('linkedID', sql.Int, Number(data.linkedID));
    }

    const result = await request.query(`
      USE ${dbName};
      INSERT INTO eventUploads (
        ${categoryClause}
        ${linkedClause}
        uploadTitle,
        filename,
        filenameS3,
        uploadtype,
        event_id,
        resource_type,
        resource_url
      )
      VALUES (
        ${categoryValue}
        ${linkedValue}
        @title,
        @filename,
        @filename,
        @ext,
        @eventID,
        @type,
        @url
      );
      SELECT SCOPE_IDENTITY() AS id;
    `);

    return result.recordset[0]?.id;
  } catch (error) {
    console.error('Error adding event resource:', error);
    throw error;
  }
}

/**
 * Delete event resource category
 */
export async function deleteEventResourceCategory(event_id, category_id, sortOrder, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('event_id', sql.Int, Number(event_id));
    request.input('category_id', sql.Int, Number(category_id));
    request.input('sortOrder', sql.Int, Number(sortOrder));
    await request.query(`
      USE ${dbName};
      EXEC dbo.node_resourceCategoryDelete
          @event_id,
          @category_id,
          @sortOrder
    `);

    return { status: 'success' };
  } catch (error) {
    console.error('Error deleting event resource category:', error);
    throw error;
  }
}