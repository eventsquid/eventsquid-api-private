/**
 * Main Lambda handler for API Gateway requests
 * Handles routing and request/response transformation
 */

import { createResponse } from './utils/response.js';
import { connectToMongo } from './utils/mongodb.js';
import { routes } from './routes/index.js';

export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Extract HTTP method and path
    const httpMethod = event.requestContext?.http?.method || event.httpMethod;
    let path = event.requestContext?.http?.path || event.path || event.rawPath;
    
    // Strip stage name from path (e.g., /dev/health -> /health)
    // API Gateway HTTP API includes the stage in the path
    const stage = event.requestContext?.stage || 
                  event.requestContext?.http?.stage ||
                  (path.split('/')[1] && path.split('/')[1] !== 'api' ? path.split('/')[1] : null);
    
    if (stage && path.startsWith(`/${stage}/`)) {
      path = path.substring(stage.length + 1); // Remove /stage prefix
    } else if (stage && path.startsWith(`/${stage}`)) {
      path = path.substring(stage.length + 1); // Remove /stage prefix
      if (!path) path = '/'; // Handle root path
    }
    
    const pathParameters = event.pathParameters || {};
    const queryStringParameters = event.queryStringParameters || {};
    
    // Parse body if present
    let body = null;
    if (event.body) {
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch (e) {
        // If body is not JSON, keep as string
        body = event.body;
      }
    }
    
    const headers = event.headers || {};

    // Handle CORS preflight requests
    if (httpMethod === 'OPTIONS') {
      return createResponse(200, {}, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Max-Age': '86400'
      });
    }

    // Create request object
    const request = {
      method: httpMethod,
      path,
      pathParameters,
      queryStringParameters,
      body,
      headers,
      event
    };

    // Find matching route
    const route = routes.find(r => {
      const methodMatch = r.method === httpMethod || r.method === 'ANY';
      const pathMatch = r.path === path || matchPath(r.path, path);
      return methodMatch && pathMatch;
    });

    if (!route) {
      return createResponse(404, { error: 'Not Found', path });
    }

    // Extract path parameters from route pattern
    const extractedParams = extractPathParameters(route.path, path);
    request.pathParameters = { ...request.pathParameters, ...extractedParams };

    // Execute route handler
    const result = await route.handler(request);

    // If handler returns a response object, use it; otherwise wrap it
    if (result && result.statusCode) {
      return result;
    }

    return createResponse(200, result);

  } catch (error) {
    console.error('Handler error:', error);
    return createResponse(500, {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Simple path matching (supports :param syntax)
 */
function matchPath(pattern, path) {
  const patternParts = pattern.split('/').filter(p => p);
  const pathParts = path.split('/').filter(p => p);

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      continue; // Parameter match
    }
    if (patternParts[i] !== pathParts[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Extract path parameters from route pattern
 */
function extractPathParameters(pattern, path) {
  const params = {};
  const patternParts = pattern.split('/').filter(p => p);
  const pathParts = path.split('/').filter(p => p);

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      const paramName = patternParts[i].substring(1);
      params[paramName] = pathParts[i];
    }
  }

  return params;
}

