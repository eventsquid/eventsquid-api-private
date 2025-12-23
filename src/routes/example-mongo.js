/**
 * Example route showing MongoDB usage
 * This demonstrates how to use the MongoDB connection utility
 */

import { getDatabase } from '../utils/mongodb.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { ObjectId } from 'mongodb';

/**
 * Example: Get all items from a collection
 */
export const getItemsRoute = {
  method: 'GET',
  path: '/api/items',
  handler: async (request) => {
    try {
      const db = await getDatabase();
      const { limit = 10, skip = 0 } = request.queryStringParameters || {};
      
      const items = await db.collection('items')
        .find({})
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .toArray();
      
      return successResponse({ items, count: items.length });
    } catch (error) {
      console.error('Error fetching items:', error);
      return errorResponse('Failed to fetch items', 500, error.message);
    }
  }
};

/**
 * Example: Get a single item by ID
 */
export const getItemRoute = {
  method: 'GET',
  path: '/api/items/:id',
  handler: async (request) => {
    try {
      const { id } = request.pathParameters;
      
      if (!ObjectId.isValid(id)) {
        return errorResponse('Invalid ID format', 400);
      }
      
      const db = await getDatabase();
      const item = await db.collection('items').findOne({ 
        _id: new ObjectId(id) 
      });
      
      if (!item) {
        return errorResponse('Item not found', 404);
      }
      
      return successResponse(item);
    } catch (error) {
      console.error('Error fetching item:', error);
      return errorResponse('Failed to fetch item', 500, error.message);
    }
  }
};

/**
 * Example: Create a new item
 */
export const createItemRoute = {
  method: 'POST',
  path: '/api/items',
  handler: async (request) => {
    try {
      const { name, description } = request.body || {};
      
      if (!name) {
        return errorResponse('Name is required', 400);
      }
      
      const db = await getDatabase();
      const result = await db.collection('items').insertOne({
        name,
        description,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      return successResponse({ 
        id: result.insertedId,
        message: 'Item created successfully'
      }, 201);
    } catch (error) {
      console.error('Error creating item:', error);
      return errorResponse('Failed to create item', 500, error.message);
    }
  }
};

