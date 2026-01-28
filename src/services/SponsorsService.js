/**
 * Sponsors Service
 * Migrated from Mantle SponsorsService.js
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { uploadS3, downloadS3 } from '../utils/s3.js';
import {
  createSponsor,
  updateSponsor,
  getAffiliateSponsors,
  deleteAffiliateSponsor,
  getEventSponsors,
  getEventSponsorLevels,
  createEventSponsorLevel,
  updateSponsorLevel,
  deleteEventSponsorLevel,
  moveEventSponsorLevel,
  moveEventSponsor,
  addSponsorToLevel,
  removeSponsorFromLevel,
  updateEventSponsor,
  addLiveMeeting,
  deleteLiveMeeting
} from '../functions/sponsors.js';
import { getAccessibleResources } from '../functions/resources.js';

class SponsorsService {
  /**
   * Create sponsor
   */
  async createSponsor(affiliateID, body, vert) {
    try {
      body.hostAffiliate_id = affiliateID;

      if (body.logo) {
        const s3File = await uploadS3(
          body.logo.data,
          body.logo.s3domain,
          'png',
          'image/png'
        );
        body.logos3 = s3File.name;
      }
      delete body['logo'];

      const newSponsor = await createSponsor(body, vert);
      
      if (!newSponsor.success) {
        throw new Error(newSponsor.message);
      }

      return { success: true, message: 'Sponsor created' };
    } catch (error) {
      console.error('Error creating sponsor:', error);
      throw error;
    }
  }

  /**
   * Update sponsor field
   */
  async updateSponsorField(sponsorID, field, data, vert) {
    try {
      let updateField = field;
      let updateValue = data;

      if (field === 'logo') {
        updateField = 'logos3';
        const s3File = await uploadS3(
          data.data,
          data.s3domain,
          'png',
          'image/png'
        );
        updateValue = s3File.name;
      }

      const updateObj = {};
      updateObj[updateField] = updateValue;

      // If clearing email, deactivate instant contact on all event sponsors
      if (updateField === 'defaultSponsorEmail' && updateValue && !updateValue.length) {
        const sql = await getConnection(vert);
        const dbName = getDatabaseName(vert);

        const request = new sql.Request();
        request.input('sponsorID', sql.Int, Number(sponsorID));
        await request.query(`
          USE ${dbName};
          UPDATE event_sponsor
          SET instantContactActive = 0
          WHERE sponsorID = @sponsorID;
        `);
      }

      return await updateSponsor(sponsorID, updateObj, vert);
    } catch (error) {
      console.error('Error updating sponsor field:', error);
      throw error;
    }
  }

  /**
   * Get affiliate sponsors
   */
  async getAffiliateSponsors(affiliateID, vert) {
    try {
      return await getAffiliateSponsors(affiliateID, vert);
    } catch (error) {
      console.error('Error getting affiliate sponsors:', error);
      throw error;
    }
  }

  /**
   * Get sponsor logo
   */
  async getSponsorLogo(filename, s3domain) {
    try {
      return await downloadS3(filename, s3domain);
    } catch (error) {
      console.error('Error getting sponsor logo:', error);
      throw error;
    }
  }

  /**
   * Delete affiliate sponsor
   */
  async deleteAffiliateSponsor(sponsorID, vert) {
    try {
      return await deleteAffiliateSponsor(sponsorID, vert);
    } catch (error) {
      console.error('Error deleting affiliate sponsor:', error);
      throw error;
    }
  }

  /**
   * Get event sponsors
   */
  async getEventSponsors(eventID, vert) {
    try {
      return await getEventSponsors(eventID, vert);
    } catch (error) {
      console.error('Error getting event sponsors:', error);
      throw error;
    }
  }

  /**
   * Get event sponsor
   */
  async getEventSponsor(eventID, sponsorID, levelID, vert) {
    try {
      const sponsors = await getEventSponsors(eventID, vert);
      return sponsors
        .map(sponsor => {
          delete sponsor['resources'];
          delete sponsor['slots'];
          return sponsor;
        })
        .find(sponsor => sponsor.level_id == levelID && sponsor.sponsorID == sponsorID);
    } catch (error) {
      console.error('Error getting event sponsor:', error);
      throw error;
    }
  }

  /**
   * Get event sponsor resources
   */
  async getEventSponsorResources(section, userID, eventID, sponsorID, vert) {
    try {
      const resources = await getAccessibleResources(
        {
          ...(section === 'web' && { showOnWebsite: true }),
          ...(section === 'mobile' && { showOnMobile: true }),
          ...(section === 'veo' && { showOnVeo: true })
        },
        userID,
        eventID,
        vert
      );

      return resources.filter(resource => resource.sponsorID === sponsorID);
    } catch (error) {
      console.error('Error getting event sponsor resources:', error);
      throw error;
    }
  }

  /**
   * Move event sponsor
   */
  async moveEventSponsor(eventID, sponsorID, levelID, sortOrder, vert) {
    try {
      return await moveEventSponsor(eventID, sponsorID, levelID, sortOrder, vert);
    } catch (error) {
      console.error('Error moving event sponsor:', error);
      throw error;
    }
  }

  /**
   * Update event sponsor
   */
  async updateEventSponsor(sponsorID, levelID, body, vert) {
    try {
      if (body['sponsorPromo'] && body['sponsorPromo'].length > 5000) {
        throw new Error('Character Limit (5000) was passed');
      }
      return await updateEventSponsor(sponsorID, levelID, body, vert);
    } catch (error) {
      console.error('Error updating event sponsor:', error);
      throw error;
    }
  }

  /**
   * Get event sponsor levels
   */
  async getEventSponsorLevels(eventID, vert) {
    try {
      return await getEventSponsorLevels(eventID, vert);
    } catch (error) {
      console.error('Error getting event sponsor levels:', error);
      throw error;
    }
  }

  /**
   * Create sponsor level
   */
  async createSponsorLevel(eventID, body, vert) {
    try {
      const { level_name, level_description, iconSize, iconsPerRow } = body;
      return await createEventSponsorLevel(
        eventID,
        level_name,
        level_description,
        iconSize,
        iconsPerRow,
        vert
      );
    } catch (error) {
      console.error('Error creating sponsor level:', error);
      throw error;
    }
  }

  /**
   * Move sponsor level
   */
  async moveSponsorLevel(eventID, levelID, sortOrder, vert) {
    try {
      return await moveEventSponsorLevel(eventID, levelID, sortOrder, vert);
    } catch (error) {
      console.error('Error moving sponsor level:', error);
      throw error;
    }
  }

  /**
   * Add sponsor to level
   */
  async addSponsorToLevel(sponsorID, levelID, affiliateID, vert) {
    try {
      const newSponsor = await addSponsorToLevel(sponsorID, levelID, affiliateID, vert);
      if (!newSponsor) {
        throw new Error('The new event sponsor could not be retrieved');
      }
      return { success: true, message: 'Sponsor added to level' };
    } catch (error) {
      console.error('Error adding sponsor to level:', error);
      throw error;
    }
  }

  /**
   * Update sponsor level
   */
  async updateSponsorLevel(levelID, body, vert) {
    try {
      return await updateSponsorLevel(levelID, body, vert);
    } catch (error) {
      console.error('Error updating sponsor level:', error);
      throw error;
    }
  }

  /**
   * Delete sponsor level
   */
  async deleteSponsorLevel(levelID, vert) {
    try {
      return await deleteEventSponsorLevel(levelID, vert);
    } catch (error) {
      console.error('Error deleting sponsor level:', error);
      throw error;
    }
  }

  /**
   * Remove sponsor from level
   */
  async removeSponsorFromLevel(levelID, sponsorID, vert) {
    try {
      return await removeSponsorFromLevel(levelID, sponsorID, vert);
    } catch (error) {
      console.error('Error removing sponsor from level:', error);
      throw error;
    }
  }

  /**
   * Add live meeting
   */
  async addLiveMeeting(eventID, sponsorID, meetings, vert) {
    try {
      return await addLiveMeeting(eventID, sponsorID, meetings, vert);
    } catch (error) {
      console.error('Error adding live meeting:', error);
      throw error;
    }
  }

  /**
   * Delete live meeting
   */
  async deleteLiveMeeting(meetingID, vert) {
    try {
      return await deleteLiveMeeting(meetingID, vert);
    } catch (error) {
      console.error('Error deleting live meeting:', error);
      throw error;
    }
  }
}

export default new SponsorsService();

