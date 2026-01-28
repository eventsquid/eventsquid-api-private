/**
 * Main Lambda handler for API Gateway requests
 * Handles routing and request/response transformation
 */

import { createResponse } from './utils/response.js';
import { connectToMongo } from './utils/mongodb.js';
import { routes } from './routes/index.js';
import { publishErrorToSNS } from './utils/sns.js';

export const handler = async (event) => {
  // Log incoming request
  console.log('=== Lambda Request Start ===');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Request ID:', event.requestContext?.requestId || 'unknown');
  console.log('HTTP Method:', event.requestContext?.http?.method || event.httpMethod);
  console.log('Path:', event.requestContext?.http?.path || event.path || event.rawPath);

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
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,cftoken,cfid,vert',
          'Access-Control-Max-Age': '86400'
        },
        body: ''
      };
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
    console.log('Executing route:', route.path, 'with method:', route.method);
    const result = await route.handler(request);
    console.log('Route handler completed, status:', result?.statusCode || 200);

    // If handler returns a response object, ensure it has CORS headers
    if (result && result.statusCode) {
      // Ensure CORS headers are present (API Gateway CORS should handle this, but include as fallback)
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,cftoken,cfid,vert'
      };
      return {
        ...result,
        headers: {
          ...corsHeaders,
          ...(result.headers || {})
        }
      };
    }

    return createResponse(200, result);

  } catch (error) {
    // Enhanced error logging
    console.error('=== Lambda Error ===');
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Request Path:', event.requestContext?.http?.path || event.path || event.rawPath);
    console.error('Request Method:', event.requestContext?.http?.method || event.httpMethod);
    console.error('Request ID:', event.requestContext?.requestId || 'unknown');
    if (error.cause) {
      console.error('Error Cause:', error.cause);
    }
    console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error('=== End Error ===');
    
    // Publish error to SNS if configured
    await publishErrorToSNS(error, {
      requestId: event.requestContext?.requestId || 'unknown',
      path: event.requestContext?.http?.path || event.path || event.rawPath,
      method: event.requestContext?.http?.method || event.httpMethod
    });
    
    return createResponse(500, {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      requestId: event.requestContext?.requestId || 'unknown'
    });
  } finally {
    console.log('=== Lambda Request End ===');
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

