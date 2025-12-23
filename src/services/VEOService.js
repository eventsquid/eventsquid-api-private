/**
 * VEO Service
 * Migrated from services/VEOService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import {
  getShareURLByEventID as getShareURLByEventIDFunc,
  getOptions as getOptionsFunc,
  saveOption as saveOptionFunc,
  connectorGetOptions as connectorGetOptionsFunc,
  connectorSaveOption as connectorSaveOptionFunc,
  getRatingsConfigBySlotAndUser as getRatingsConfigBySlotAndUserFunc,
  checkUsage as checkUsageFunc,
  setUsage as setUsageFunc,
  schedulingGridGetSlots as schedulingGridGetSlotsFunc,
  schedulingGridExportSlots as schedulingGridExportSlotsFunc,
  schedulingGridGetVenues as schedulingGridGetVenuesFunc,
  schedulingGridGetRoomsByAffiliate as schedulingGridGetRoomsByAffiliateFunc
} from '../functions/veo.js';
import { getAccessibleResources, getEventResourceCategories } from '../functions/resources.js';
import moment from 'moment-timezone';
import _ from 'lodash';

class VEOService {
  /**
   * Get share URL by event ID
   */
  async getShareURLByEventID(request) {
    try {
      const eventID = Number(request.pathParameters?.eventID);
      const affiliateID = Number(request.session?.affiliate_id || 0);
      const vert = request.headers?.vert || request.vert || '';

      return await getShareURLByEventIDFunc(eventID, affiliateID, vert);
    } catch (error) {
      console.error('Error getting share URL by event ID:', error);
      throw error;
    }
  }

  /**
   * Connector - Get options by slot ID
   */
  async connectorGetOptions(request) {
    try {
      const slotID = Number(request.pathParameters?.slotID);
      const vert = request.headers?.vert || request.vert || '';

      return await connectorGetOptionsFunc(slotID, vert);
    } catch (error) {
      console.error('Error getting connector options:', error);
      throw error;
    }
  }

  /**
   * Connector - Save option
   */
  async connectorSaveOption(request) {
    try {
      const form = request.body || {};
      const vert = request.headers?.vert || request.vert || '';

      return await connectorSaveOptionFunc(form, vert);
    } catch (error) {
      console.error('Error saving connector option:', error);
      throw error;
    }
  }

  /**
   * Get options by event GUID
   */
  async getOptions(request) {
    try {
      const eventGUID = request.pathParameters?.eventGUID;
      const vert = request.headers?.vert || request.vert || '';

      return await getOptionsFunc(eventGUID, vert);
    } catch (error) {
      console.error('Error getting VEO options:', error);
      throw error;
    }
  }

  /**
   * Save option
   */
  async saveOption(request) {
    try {
      const { eventGUID, colName, fieldValue } = request.body || {};
      const vert = request.headers?.vert || request.vert || '';

      return await saveOptionFunc(eventGUID, colName, fieldValue, vert);
    } catch (error) {
      console.error('Error saving VEO option:', error);
      throw error;
    }
  }

  /**
   * Get ratings config by slot and user
   */
  async getRatingsConfigBySlotAndUser(request) {
    try {
      const slotID = Number(request.pathParameters?.slotID);
      const userID = Number(request.session?.user_id || 0);
      const vert = request.headers?.vert || request.vert || '';

      const result = await getRatingsConfigBySlotAndUserFunc(userID, slotID, vert);
      return result[0] || {};
    } catch (error) {
      console.error('Error getting ratings config by slot and user:', error);
      throw error;
    }
  }

  /**
   * Check usage
   */
  async checkUsage(request) {
    try {
      const slotID = Number(request.pathParameters?.slotID);
      const userID = Number(request.pathParameters?.userID);
      const actionID = request.pathParameters?.actionID;
      const vert = request.headers?.vert || request.vert || '';

      return await checkUsageFunc(slotID, userID, actionID, vert);
    } catch (error) {
      console.error('Error checking usage:', error);
      throw error;
    }
  }

  /**
   * Set usage
   */
  async setUsage(request) {
    try {
      const { eventID, slotID, actionID } = request.body || {};
      const session = request.session || {};
      const vert = request.headers?.vert || request.vert || '';

      return await setUsageFunc(eventID, slotID, actionID, session, vert);
    } catch (error) {
      console.error('Error setting usage:', error);
      throw error;
    }
  }

  /**
   * Check if VEO is active
   */
  async checkVeoActive(eventGUID, vert) {
    try {
      const options = await getOptionsFunc(eventGUID, vert);

      let active = false;
      if (options.length) {
        const option = options[0];
        if (option.veoActivationDate) {
          const now = moment();
          const afterActivation = now.isAfter(moment(option.veoActivationDate));
          let beforeEnd = true;
          if (option.veoDeactivationDate) {
            beforeEnd = now.isBefore(moment(option.veoDeactivationDate));
          }

          active = afterActivation && beforeEnd;
        } else if (option.veoOn) {
          active = true;
        }
      }

      return {
        active,
        message: options[0]?.veoOffMessage && options[0].veoOffMessage.length
          ? options[0].veoOffMessage
          : '<p>The event has not yet begun! Please check back when the event is live.</p>'
      };
    } catch (error) {
      console.error('Error checking VEO active status:', error);
      throw error;
    }
  }

  /**
   * Scheduling Grid - Get slots
   */
  async schedulingGridGetSlots(request) {
    try {
      const scheduleID = Number(request.pathParameters?.scheduleID);
      const vert = request.headers?.vert || request.vert || '';

      return await schedulingGridGetSlotsFunc(scheduleID, vert);
    } catch (error) {
      console.error('Error getting scheduling grid slots:', error);
      throw error;
    }
  }

  /**
   * Scheduling Grid - Export slots
   */
  async schedulingGridExportSlots(request) {
    try {
      const scheduleID = Number(request.pathParameters?.scheduleID);
      const vert = request.headers?.vert || request.vert || '';

      return await schedulingGridExportSlotsFunc(scheduleID, vert);
    } catch (error) {
      console.error('Error exporting scheduling grid slots:', error);
      throw error;
    }
  }

  /**
   * Scheduling Grid - Get venues
   */
  async schedulingGridGetVenues(request) {
    try {
      const affiliateID = Number(request.pathParameters?.affiliateID);
      const vert = request.headers?.vert || request.vert || '';

      return await schedulingGridGetVenuesFunc(affiliateID, vert);
    } catch (error) {
      console.error('Error getting scheduling grid venues:', error);
      throw error;
    }
  }

  /**
   * Scheduling Grid - Get rooms by affiliate
   */
  async schedulingGridGetRoomsByAffiliate(request) {
    try {
      const affiliateID = Number(request.pathParameters?.affiliateID);
      const vert = request.headers?.vert || request.vert || '';

      return await schedulingGridGetRoomsByAffiliateFunc(affiliateID, vert);
    } catch (error) {
      console.error('Error getting scheduling grid rooms by affiliate:', error);
      throw error;
    }
  }

  /**
   * Get VEO resources
   */
  async getVeoResources(userID, eventID, vert) {
    try {
      // Get all the resources
      const resources = await getAccessibleResources(
        { showOnVeo: true },
        userID,
        eventID,
        vert
      );

      // Get all the categories
      const resourceCategories = await getEventResourceCategories(eventID, vert);

      // Map the items to their categories
      let categories = resourceCategories.map(category => ({
        name: category.name,
        id: category.id,
        sortOrder: category.sortOrder,
        items: resources.filter(resource => resource.category_id == category.id)
      }));

      // Handle sorting of categories and items in the categories
      categories = _.sortBy(categories, 'sortOrder');
      categories = categories.map(category => {
        category.items = _.sortBy(category.items, 'sortOrder');
        return category;
      });

      // Get the ungrouped data
      const ungrouped = _.sortBy(
        resources.filter(resource => Number(resource.category_id) === 0),
        'sortOrder'
      );

      return {
        ungrouped,
        categories
      };
    } catch (error) {
      console.error('Error getting VEO resources:', error);
      throw error;
    }
  }
}

export default VEOService;

