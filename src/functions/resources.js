/**
 * Resources functions
 * Migrated from Mantle functions/resources
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

/**
 * Get accessible resources for a user/event
 * Simplified version - full implementation needs getEventResources and attendee functions
 */
export async function getAccessibleResources(filter, userID, eventID, vert) {
  try {
    // TODO: Full implementation needs:
    // - getEventResources function
    // - getRegisteredAttendeeByUserID function
    // - getAttendeeAgendaSlots function
    
    // For now, return empty array - this will be fully implemented when those functions are available
    console.log('getAccessibleResources called - needs full implementation with getEventResources');
    return [];
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const data = await connection.sql(`
      USE ${dbName};
      SELECT *
      FROM resource_categories
      WHERE event_id = @eventID
          AND deleted = 0
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const filterClause = filter && filter.length 
      ? `AND u.resource_type IN (${filter.map(item => `'${item}'`).join(',')})`
      : '';

    const results = await connection.sql(`
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
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const data = await connection.sql(`
      USE ${dbName};
      SELECT *
      FROM resource_categories
      WHERE affiliate_id = @affiliateID
          AND deleted = 0
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    let categoryID = null;
    if (data.category && data.category.length) {
      const affiliateCategories = await getAffiliateResourceCategories(affiliateID, vert);
      let matchingCategory = affiliateCategories.find(category => category.name == data.category);

      if (matchingCategory) {
        categoryID = matchingCategory.id;
      } else {
        categoryID = await createResourceCategory(affiliateID, null, data.category, vert);
      }
    }

    const categoryClause = categoryID ? 'category_id,' : '';
    const categoryValue = categoryID ? '@categoryID,' : '';

    const result = await connection.sql(`
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
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .parameter('title', TYPES.VarChar, data.title || '')
    .parameter('filename', TYPES.VarChar, data.filename || '')
    .parameter('ext', TYPES.VarChar, data.ext || '')
    .parameter('type', TYPES.VarChar, data.type || '')
    .parameter('url', TYPES.VarChar, data.url || '')
    .parameter('categoryID', TYPES.Int, categoryID)
    .execute();

    return result[0]?.id;
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const getUpdateData = (field) => {
      switch (field) {
        case 'uploadTitle':
          return { type: TYPES.VarChar, fieldName: 'uploadTitle' };
        case 'description':
          return { type: TYPES.VarChar, fieldName: 'description' };
        case 'resource_url':
          return { type: TYPES.VarChar, fieldName: 'resource_url' };
        case 'preview_url':
          return { type: TYPES.VarChar, fieldName: 'preview_url' };
        case 'category_id':
          return { type: TYPES.Int, fieldName: 'category_id' };
        case 'resource_type':
          return { type: TYPES.VarChar, fieldName: 'resource_type' };
        default:
          throw new Error(`Unknown field: ${field}`);
      }
    };

    const { fieldName, type } = getUpdateData(field);

    await connection.sql(`
      USE ${dbName};
      UPDATE user_uploads
      SET ${fieldName} = @value
      WHERE doc_id = @uploadID
          AND affiliate_id = @affiliateID
    `)
    .parameter('uploadID', TYPES.Int, Number(uploadID))
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .parameter('value', type, value)
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      UPDATE user_uploads SET deleted = 1 WHERE doc_id = @uploadID AND affiliate_id = @affiliateID;
      UPDATE eventUploads SET linkedLibraryDocID = NULL WHERE linkedLibraryDocID = @uploadID;
    `)
    .parameter('uploadID', TYPES.Int, Number(uploadID))
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
      USE ${dbName};
      SELECT * 
      FROM eventUploads 
      WHERE 
          linkedLibraryDocID IN (
              SELECT doc_id FROM user_uploads WHERE affiliate_id = @affiliateID AND deleted = 0
          ) 
          AND deleted = 0
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    if (affiliate_id !== null) {
      affiliate_id = Number(affiliate_id) === 0 ? 1 : Number(affiliate_id);
    }

    const result = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_resourceCategoryAdd
          @affiliate_id,
          @event_id,
          @name
    `)
    .parameter('affiliate_id', TYPES.Int, affiliate_id)
    .parameter('event_id', TYPES.Int, Number(event_id || 0))
    .parameter('name', TYPES.VarChar, String(name))
    .execute();

    return result[0];
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_resourceCategoryUpdate
          @category_id,
          @name
    `)
    .parameter('category_id', TYPES.Int, Number(category_id))
    .parameter('name', TYPES.VarChar, String(name))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      UPDATE resource_categories
      SET deleted = 1
      WHERE affiliate_id = @affiliate_id
          AND category_id = @category_id;
      UPDATE user_uploads SET category_id = NULL WHERE category_id = @category_id;
    `)
    .parameter('affiliate_id', TYPES.Int, Number(affiliate_id))
    .parameter('category_id', TYPES.Int, Number(category_id))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const getUpdateData = (field) => {
      switch (field) {
        case 'uploadTitle':
          return { type: TYPES.VarChar, fieldName: 'uploadTitle' };
        case 'description':
          return { type: TYPES.VarChar, fieldName: 'description' };
        case 'resource_url':
          return { type: TYPES.VarChar, fieldName: 'resource_url' };
        case 'preview_url':
          return { type: TYPES.VarChar, fieldName: 'preview_url' };
        case 'category_id':
          return { type: TYPES.Int, fieldName: 'category_id' };
        case 'sortOrder':
          return { type: TYPES.Int, fieldName: 'sortOrder' };
        case 'resource_type':
          return { type: TYPES.VarChar, fieldName: 'resource_type' };
        case 'showOnWebsite':
          return { type: TYPES.Bit, fieldName: 'showOnWebsite' };
        case 'showOnMobile':
          return { type: TYPES.Bit, fieldName: 'showOnMobile' };
        case 'showOnVeo':
          return { type: TYPES.Bit, fieldName: 'showOnVeo' };
        case 'accessRestriction':
          return { type: TYPES.Int, fieldName: 'accessRestriction' };
        case 'linkedLibraryDocID':
          return { type: TYPES.Int, fieldName: 'linkedLibraryDocID' };
        case 'deleted':
          return { type: TYPES.Bit, fieldName: 'deleted' };
        case 'filename':
          return { type: TYPES.VarChar, fieldName: 'filename' };
        case 'filenameS3':
          return { type: TYPES.VarChar, fieldName: 'filename' };
        default:
          throw new Error(`Unknown field: ${field}`);
      }
    };

    const { fieldName, type } = getUpdateData(field);
    const filenameUpdate = fieldName === 'filename' ? ',filenameS3 = @value' : '';

    await connection.sql(`
      USE ${dbName};
      UPDATE eventUploads
      SET ${fieldName} = @value${filenameUpdate}
      WHERE upload_id = @uploadID
          AND event_id = @eventID
    `)
    .parameter('uploadID', TYPES.Int, Number(uploadID))
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('value', type, value)
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      UPDATE eventUploads SET deleted = 1 WHERE upload_id = @uploadID AND event_id = @eventID;
    `)
    .parameter('uploadID', TYPES.Int, Number(uploadID))
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

    return 'Deleted resource from event';
  } catch (error) {
    console.error('Error deleting event resource:', error);
    throw error;
  }
}

