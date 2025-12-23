/**
 * Reporting Service
 * Migrated from services/ReportingService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import { ObjectId } from 'mongodb';
import _ from 'lodash';

class ReportingService {
  /**
   * Find report layouts by event
   */
  async findReportLayoutsByEvent(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventGUID = request.pathParameters?.eventGUID;
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const userID = request.session?.user_id || request.user?.user_id;

      if (!affiliateID || !userID) {
        throw new Error('Affiliate ID and User ID required');
      }

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('report-layouts');

      const reportsRA = await layoutsColl.find({
        $or: [
          // Reports owned by this user
          {
            eg: String(eventGUID),
            a: Number(affiliateID),
            _x: { $ne: true },
            'own.u': Number(userID)
          },
          // Or reports that are shared
          {
            eg: String(eventGUID),
            a: Number(affiliateID),
            _x: { $ne: true },
            pb: true
          }
        ]
      }, {
        projection: { _id: 0, id: 1, lm: 1, nm: 1, de: 1, pb: 1, cat: 1, own: 1 }
      })
      .sort({ nm: 1 })
      .toArray();

      // Flag reports as editable if owned by this user
      for (let i = 0; i < reportsRA.length; i++) {
        if (reportsRA[i].own && reportsRA[i].own.u === Number(userID)) {
          reportsRA[i]._admin = true;
        }
      }

      return reportsRA;
    } catch (error) {
      console.error('Error finding report layouts by event:', error);
      throw error;
    }
  }

  /**
   * Find CEU Summary Report layouts by event
   */
  async findCEUSummaryReportLayoutsByEvent(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventGUID = request.pathParameters?.eventGUID;

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-summary-reports');

      const reportsRA = await layoutsColl.find({
        eg: String(eventGUID)
      }).toArray();

      return reportsRA;
    } catch (error) {
      console.error('Error finding CEU summary report layouts:', error);
      throw error;
    }
  }

  /**
   * Find CEU Detail Report layouts by event
   */
  async findCEUDetailReportLayoutsByEvent(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventGUID = request.pathParameters?.eventGUID;

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-detail-reports');

      const reportsRA = await layoutsColl.find({
        eg: String(eventGUID)
      }).toArray();

      return reportsRA;
    } catch (error) {
      console.error('Error finding CEU detail report layouts:', error);
      throw error;
    }
  }

  /**
   * Find report layouts by event and category
   */
  async findReportLayoutsByEventAndCategory(request) {
    try {
      const reportsRA = await this.findReportLayoutsByEvent(request);
      const categoriesRA = await this.findReportCategories(request);

      const reportCatRA = [];

      // Loop the categories
      for (let i = 0; i < categoriesRA.length; i++) {
        const thisCat = String(categoriesRA[i].cat);

        // Add the new category to the category array
        reportCatRA.push({
          cat: String(thisCat),
          reports: _.filter(reportsRA, (c) => {
            return c.cat?.toLowerCase() === thisCat.toLowerCase();
          })
        });
      }

      return reportCatRA;
    } catch (error) {
      console.error('Error finding report layouts by event and category:', error);
      throw error;
    }
  }

  /**
   * Find report layout
   */
  async findReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('report-layouts');

      // Note: HOTFIX 5367 - Don't check affiliate
      // If someone is logged in under a different affiliate, and clicks a link to the report, it won't come up
      const layout = await layoutsColl.findOne({
        id: reportID
      });

      return layout || {};
    } catch (error) {
      console.error('Error finding report layout:', error);
      throw error;
    }
  }

  /**
   * Save report category (helper method)
   */
  async saveReportCategory(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;

      if (!affiliateID) {
        throw new Error('Affiliate ID required');
      }

      const db = await getDatabase(null, vert);
      const layoutCatsColl = db.collection('report-layout-categories');

      const lastUpdated = new Date();
      const regExLiteral = `^${_.trim(request.body.cat)}$`;
      const catRegEx = new RegExp(regExLiteral, 'i');

      await layoutCatsColl.updateOne(
        {
          a: Number(affiliateID),
          cat: catRegEx
        },
        {
          $set: {
            lu: lastUpdated
          },
          $setOnInsert: {
            a: Number(affiliateID),
            da: lastUpdated,
            cat: _.trim(request.body.cat)
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error saving report category:', error);
      throw error;
    }
  }

  /**
   * Upsert report layout
   */
  async upsertReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const userID = request.session?.user_id || request.user?.user_id;
      const userEmail = request.session?.user_email || request.user?.user_email || '';
      const userFirst = request.session?.user_firstname || request.user?.user_firstname || '';
      const userLast = request.session?.user_lastname || request.user?.user_lastname || '';

      if (!affiliateID || !userID) {
        throw new Error('Affiliate ID and User ID required');
      }

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('report-layouts');

      // If there's no category, set it to default
      if (!request.body.cat || _.trim(request.body.cat) === '') {
        request.body.cat = 'Default';
      }

      // Set this category for this affiliate
      await this.saveReportCategory(request);

      const dataObj = { ...request.body };

      // For a new setup
      if (request.body.mode === 'new') {
        dataObj._id = String(reportID);
        dataObj.id = String(reportID);
        dataObj.a = Number(affiliateID);
        dataObj.e = Number(request.body.e);
        dataObj.eg = String(request.body.eg);
        dataObj.da = new Date();
        dataObj.h = [{
          ue: String(userEmail),
          uf: String(userFirst),
          ul: String(userLast),
          u: Number(userID),
          da: new Date(),
          act: 'Created report.'
        }];
        dataObj.own = {
          ue: String(userEmail),
          uf: String(userFirst),
          ul: String(userLast),
          u: Number(userID)
        };
        dataObj.pb = Boolean(request.body.pb);
        dataObj.cat = _.trim(request.body.cat).toLowerCase();

        delete dataObj.mode;

        await layoutsColl.insertOne(dataObj);
        return { status: 'success', message: 'Report layout created' };
      } else {
        // For an existing setup
        dataObj.id = String(reportID);
        dataObj.pb = Boolean(request.body.pb);
        dataObj.cat = _.trim(request.body.cat).toLowerCase();
        delete dataObj.e;
        delete dataObj.eg;
        delete dataObj.mode;

        await layoutsColl.updateOne(
          { _id: String(reportID), a: Number(affiliateID) },
          {
            $currentDate: { da: { $type: 'date' } },
            $set: dataObj,
            $push: {
              h: {
                ue: String(userEmail),
                uf: String(userFirst),
                ul: String(userLast),
                u: Number(userID),
                da: new Date(),
                act: 'Saved changes.'
              }
            }
          }
        );
        return { status: 'success', message: 'Report layout updated' };
      }
    } catch (error) {
      console.error('Error upserting report layout:', error);
      throw error;
    }
  }

  /**
   * Delete report layout
   */
  async deleteReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const userID = request.session?.user_id || request.user?.user_id;
      const userEmail = request.session?.user_email || request.user?.user_email || '';
      const userFirst = request.session?.user_firstname || request.user?.user_firstname || '';
      const userLast = request.session?.user_lastname || request.user?.user_lastname || '';

      if (!affiliateID || !userID) {
        throw new Error('Affiliate ID and User ID required');
      }

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('report-layouts');

      await layoutsColl.updateOne(
        {
          id: String(reportID),
          a: Number(affiliateID),
          'own.u': Number(userID)
        },
        {
          $set: { _x: true },
          $push: {
            h: {
              ue: String(userEmail),
              uf: String(userFirst),
              ul: String(userLast),
              u: Number(userID),
              da: new Date(),
              act: 'Deleted report.'
            }
          }
        }
      );

      return { status: 'success', message: 'Report layout deleted' };
    } catch (error) {
      console.error('Error deleting report layout:', error);
      throw error;
    }
  }

  /**
   * Delete CEU Summary Report layout
   */
  async deleteCEUSummaryReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-summary-reports');

      await layoutsColl.deleteOne({
        _id: new ObjectId(reportID)
      });

      return { status: 'success', message: 'CEU summary report layout deleted' };
    } catch (error) {
      console.error('Error deleting CEU summary report layout:', error);
      throw error;
    }
  }

  /**
   * Delete CEU Detail Report layout
   */
  async deleteCEUDetailReportLayout(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const reportID = request.pathParameters?.reportID;

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('ceu-detail-reports');

      await layoutsColl.deleteOne({
        _id: new ObjectId(reportID)
      });

      return { status: 'success', message: 'CEU detail report layout deleted' };
    } catch (error) {
      console.error('Error deleting CEU detail report layout:', error);
      throw error;
    }
  }

  /**
   * Find report categories
   */
  async findReportCategories(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;

      if (!affiliateID) {
        throw new Error('Affiliate ID required');
      }

      const db = await getDatabase(null, vert);
      const layoutCatsColl = db.collection('report-layout-categories');

      const categories = await layoutCatsColl.find(
        { a: Number(affiliateID), _x: { $exists: false } },
        { projection: { _id: 0, cat: 1 } }
      )
      .sort({ cat: 1 })
      .toArray();

      return categories;
    } catch (error) {
      console.error('Error finding report categories:', error);
      throw error;
    }
  }

  /**
   * Update report category by event
   */
  async updateReportCategoryByEvent(request) {
    try {
      const vert = request.headers?.vert || request.headers?.Vert || request.headers?.VERT;
      const eventGUID = request.pathParameters?.eventGUID;
      const affiliateID = request.session?.affiliate_id || request.user?.affiliate_id;
      const userID = request.session?.user_id || request.user?.user_id;
      const userEmail = request.session?.user_email || request.user?.user_email || '';
      const userFirst = request.session?.user_firstname || request.user?.user_firstname || '';
      const userLast = request.session?.user_lastname || request.user?.user_lastname || '';

      if (!affiliateID || !userID) {
        throw new Error('Affiliate ID and User ID required');
      }

      // Save the category as new, so the existing category can still exist under other events
      await this.saveReportCategory(request);

      const db = await getDatabase(null, vert);
      const layoutsColl = db.collection('report-layouts');

      const catRegEx = new RegExp(_.trim(request.body.oldcat), 'i');

      // Modify all reports for this event that use the old category (and that this user is the owner of)
      // and reassign them to the new category
      await layoutsColl.updateMany(
        {
          a: Number(affiliateID),
          cat: catRegEx,
          eg: String(eventGUID),
          'own.u': Number(userID)
        },
        {
          $currentDate: { da: { $type: 'date' } },
          $set: { cat: _.trim(request.body.cat).toLowerCase() },
          $push: {
            h: {
              ue: String(userEmail),
              uf: String(userFirst),
              ul: String(userLast),
              u: Number(userID),
              da: new Date(),
              act: 'Category change.'
            }
          }
        }
      );

      return { status: 'success', message: 'Report category updated' };
    } catch (error) {
      console.error('Error updating report category by event:', error);
      throw error;
    }
  }
}

export default ReportingService;

