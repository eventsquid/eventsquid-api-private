/**
 * Affiliate routes
 * Migrated from affiliate-controller.js
 */

import { createResponse } from '../utils/response.js';
import { authenticate, verticalCheck } from '../middleware/auth.js';
import AffiliateService from '../services/AffiliateService.js';

const affiliateService = new AffiliateService();

// Get affiliate resources grouped
export const getAffiliateResourcesGroupedRoute = {
  method: 'GET',
  path: '/affiliate/:affiliateID/resources/grouped',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await affiliateService.getAffiliateResourcesGrouped(Number(affiliateID), vert);
    return createResponse(200, result);
  }
};

// Add document to affiliate
export const addDocumentToAffiliateRoute = {
  method: 'POST',
  path: '/affiliate/:affiliateID/resource/add/document',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const s3FileData = await affiliateService.addDocumentToAffiliate(
      Number(affiliateID),
      request.body,
      vert
    );
    return createResponse(200, s3FileData);
  }
};

// Add video to affiliate
export const addVideoToAffiliateRoute = {
  method: 'POST',
  path: '/affiliate/:affiliateID/resource/add/video',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const resourceData = {
      title: request.body.title,
      type: request.body.type,
      url: request.body.url,
      category: request.body.category,
    };
    const result = await affiliateService.addVideoToAffiliate(
      Number(affiliateID),
      resourceData,
      vert
    );
    return createResponse(200, result);
  }
};

// Replace document
export const replaceDocumentRoute = {
  method: 'POST',
  path: '/affiliate/:affiliateID/resource/replace/document',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const result = await affiliateService.replaceS3File(request.body);
    return createResponse(200, result);
  }
};

// Update affiliate resource
export const updateAffiliateResourceRoute = {
  method: 'POST',
  path: '/affiliate/:affiliateID/resource/:resourceID',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID, resourceID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await affiliateService.updateAffiliateResource(
      Number(affiliateID),
      resourceID,
      request.body.field,
      request.body.value,
      vert
    );
    return createResponse(200, result);
  }
};

// Check resource links
export const checkResourceLinksRoute = {
  method: 'GET',
  path: '/affiliate/:affiliateID/resource/:resourceID/checkLinks',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID, resourceID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const resources = await affiliateService.checkResourceLinks(
      Number(affiliateID),
      resourceID,
      vert
    );
    return createResponse(200, resources);
  }
};

// Delete affiliate resource
export const deleteAffiliateResourceRoute = {
  method: 'DELETE',
  path: '/affiliate/:affiliateID/resource/:resourceID/:type',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID, resourceID, type } = request.pathParameters || {};
    const s3domain = request.headers?.['s3domain'] || request.headers?.['S3domain'] || request.headers?.['S3DOMAIN'];
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await affiliateService.deleteAffiliateResource(
      Number(affiliateID),
      resourceID,
      type,
      s3domain,
      vert
    );
    return createResponse(200, result);
  }
};

// Update affiliate resource category
export const updateAffiliateResourceCategoryRoute = {
  method: 'POST',
  path: '/affiliate/:affiliateID/resources/categories/update',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await affiliateService.updateAffiliateResourceCategory(
      request.body.category_id,
      request.body.name,
      vert
    );
    return createResponse(200, result);
  }
};

// Delete affiliate resource category
export const deleteAffiliateResourceCategoryRoute = {
  method: 'DELETE',
  path: '/affiliate/:affiliateID/resources/categories/delete/:category_id',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID, category_id } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await affiliateService.deleteAffiliateResourceCategory(
      Number(affiliateID),
      category_id,
      vert
    );
    return createResponse(200, result);
  }
};

// Create affiliate resource category
export const createAffiliateResourceCategoryRoute = {
  method: 'POST',
  path: '/affiliate/:affiliateID/resources/categories/add',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const result = await affiliateService.createAffiliateResourceCategory(
      Number(affiliateID),
      request.body.name,
      vert
    );
    return createResponse(200, result);
  }
};

// Get surveys
export const getSurveysRoute = {
  method: 'GET',
  path: '/affiliate/:affiliateID/surveys',
  handler: async (request) => {
    await authenticate(request);
    await verticalCheck(request);
    const { affiliateID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    const surveys = await affiliateService.getSurveys(Number(affiliateID), vert);
    return createResponse(200, surveys);
  }
};

