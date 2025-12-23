/**
 * Affiliate Service
 * Migrated from services/AffiliateService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import {
  getAffiliateResources,
  getAffiliateResourceCategories,
  addAffiliateResource,
  updateAffiliateResource as updateAffiliateResourceFunc,
  deleteAffiliateResource as deleteAffiliateResourceFunc,
  getLinkedResourcesByAffiliate,
  createResourceCategory,
  updateResourceCategory,
  deleteAffiliateResourceCategory,
  updateEventResource,
  deleteEventResource
} from '../functions/resources.js';
import { uploadS3, deleteS3, copyS3 } from '../utils/s3.js';
import _ from 'lodash';

class AffiliateService {
  /**
   * Get affiliate resources grouped
   */
  async getAffiliateResourcesGrouped(affiliateID, vert) {
    try {
      const resources = await getAffiliateResources(affiliateID, [], vert);
      const resourceCategories = await getAffiliateResourceCategories(affiliateID, vert);

      let categories = resourceCategories.map(category => ({
        name: category.name,
        id: category.id,
        sortOrder: category.sortOrder,
        items: resources.filter(resource => resource.category_id == category.id)
      }));

      categories = _.sortBy(categories, 'uploadTitle');
      categories = _.sortBy(categories.map(category => {
        category.items = _.sortBy(category.items, 'uploadTitle');
        return category;
      }), 'name');

      const ungrouped = _.sortBy(
        resources.filter(resource => Number(resource.category_id) === 0),
        'uploadTitle'
      );

      return {
        ungrouped,
        categories
      };
    } catch (error) {
      console.error('Error getting affiliate resources grouped:', error);
      throw error;
    }
  }

  /**
   * Add document to affiliate
   */
  async addDocumentToAffiliate(affiliateID, body, vert) {
    try {
      const fileData = await uploadS3(
        body.file,
        body.s3domain || '',
        body.ext || '',
        body.type || 'application/octet-stream'
      );

      await addAffiliateResource(affiliateID, {
        title: body.title,
        ext: body.ext,
        filename: fileData.name,
        category: body.category,
        type: 'document-upload'
      }, vert);

      return fileData;
    } catch (error) {
      console.error('Error adding document to affiliate:', error);
      throw error;
    }
  }

  /**
   * Add video to affiliate
   */
  async addVideoToAffiliate(affiliateID, resourceData, vert) {
    try {
      const data = {
        title: resourceData.title,
        url: resourceData.url,
        category: resourceData.category,
        type: resourceData.type
      };

      await addAffiliateResource(affiliateID, data, vert);

      return { message: 'Added event resource' };
    } catch (error) {
      console.error('Error adding video to affiliate:', error);
      throw error;
    }
  }

  /**
   * Replace S3 file
   */
  async replaceS3File(body) {
    try {
      // Delete old file
      await deleteS3(body.name, body.s3domain || '');

      // Add new file
      return await uploadS3(
        body.file,
        body.s3domain || '',
        body.ext || '',
        body.type || 'application/octet-stream',
        body.name
      );
    } catch (error) {
      console.error('Error replacing S3 file:', error);
      throw error;
    }
  }

  /**
   * Update affiliate resource
   */
  async updateAffiliateResource(affiliateID, resourceID, field, value, vert) {
    try {
      if (!Number(affiliateID)) return 'No Affiliate ID Provided';
      if (!Number(resourceID)) return 'No Resource ID Provided';
      if (!String(field)) return 'No Field Provided';

      return await updateAffiliateResourceFunc(affiliateID, resourceID, field, value, vert);
    } catch (error) {
      console.error('Error updating affiliate resource:', error);
      throw error;
    }
  }

  /**
   * Check resource links
   */
  async checkResourceLinks(affiliateID, resourceID, vert) {
    try {
      if (!Number(affiliateID)) return 'No Affiliate ID Provided';
      if (!Number(resourceID)) return 'No Resource ID Provided';

      const resources = await getAffiliateResources(affiliateID, [], vert);
      const resource = resources.find(resource => resource.doc_id == resourceID);
      
      return resource?.linkedTo?.map(link => link.title) || [];
    } catch (error) {
      console.error('Error checking resource links:', error);
      throw error;
    }
  }

  /**
   * Delete affiliate resource
   */
  async deleteAffiliateResource(affiliateID, resourceID, type, s3domain, vert) {
    try {
      if (!Number(affiliateID)) return 'No Affiliate ID Provided';
      if (!Number(resourceID)) return 'No Resource ID Provided';

      const linkedResources = await getLinkedResourcesByAffiliate(affiliateID, vert);

      if (type === 'copy') {
        for (const resource of linkedResources) {
          if (resource.resource_type === 'document-upload') {
            // Copy and get new URL
            const filename = resource.filenameS3?.length ? resource.filenameS3 : resource.filename;
            const newFile = await copyS3(filename, s3domain || '');
            // Store new URL on event resource
            await updateEventResource(resource.event_id, resource.upload_id, 'filename', newFile.name, vert);
          }
        }
      } else {
        // Delete all of the linked resources
        for (const resource of linkedResources) {
          await deleteEventResource(resource.event_id, resource.upload_id, vert);
        }
      }

      // Set affiliate resource to deleted
      // Remove link IDs from event resources
      return await deleteAffiliateResourceFunc(affiliateID, resourceID, vert);
    } catch (error) {
      console.error('Error deleting affiliate resource:', error);
      throw error;
    }
  }

  /**
   * Update affiliate resource category
   */
  async updateAffiliateResourceCategory(category_id, name, vert) {
    try {
      return await updateResourceCategory(category_id, name, vert);
    } catch (error) {
      console.error('Error updating affiliate resource category:', error);
      throw error;
    }
  }

  /**
   * Delete affiliate resource category
   */
  async deleteAffiliateResourceCategory(affiliateID, category_id, vert) {
    try {
      return await deleteAffiliateResourceCategory(affiliateID, category_id, vert);
    } catch (error) {
      console.error('Error deleting affiliate resource category:', error);
      throw error;
    }
  }

  /**
   * Create affiliate resource category
   */
  async createAffiliateResourceCategory(affiliateID, name, vert) {
    try {
      return await createResourceCategory(affiliateID, null, name, vert);
    } catch (error) {
      console.error('Error creating affiliate resource category:', error);
      throw error;
    }
  }

  /**
   * Get surveys
   */
  async getSurveys(affiliateID, vert) {
    try {
      const db = await getDatabase(null, vert);
      const surveys = db.collection('surveys');

      const results = await surveys
        .find({
          '_id.a': Number(affiliateID),
          $or: [
            { deleted: { $exists: false } },
            { deleted: false }
          ]
        })
        .toArray();

      return results;
    } catch (error) {
      console.error('Error getting surveys:', error);
      throw error;
    }
  }
}

export default AffiliateService;

