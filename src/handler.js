/**
 * Main Lambda handler for API Gateway requests
 * Handles routing and request/response transformation
 */

import { createResponse } from './utils/response.js';
import { connectToMongo } from './utils/mongodb.js';
import { routes } from './routes/index.js';
import { publishErrorToSNS } from './utils/sns.js';

export const handler = async (event) => {
  const reqMethod = event.requestContext?.http?.method || event.httpMethod;
  const reqPath = event.requestContext?.http?.path || event.path || event.rawPath;
  const reqId = event.requestContext?.requestId || 'unknown';
  console.log(`[${reqId}] ${reqMethod} ${reqPath}`);

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
    
    // Parse body if present (API Gateway may send base64-encoded body when binary media types are configured)
    let body = null;
    if (event.body) {
      let rawBody = event.body;
      if (event.isBase64Encoded && typeof rawBody === 'string') {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
      }
      // Try parse as JSON; if body is base64-encoded JSON (without isBase64Encoded set), try decode then parse
      try {
        body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      } catch (e) {
        if (typeof rawBody === 'string') {
          try {
            const decoded = Buffer.from(rawBody, 'base64').toString('utf8');
            if (decoded.trim().startsWith('{') || decoded.trim().startsWith('[')) {
              body = JSON.parse(decoded);
            } else {
              body = rawBody;
            }
          } catch (e2) {
            body = rawBody;
          }
        } else {
          body = rawBody;
        }
      }
      // Handle body as array of bytes (API Gateway or client may send JSON as array of char codes)
      if (Array.isArray(body) && body.length > 0) {
        try {
          const str = typeof body[0] === 'number'
            ? Buffer.from(body).toString('utf8')
            : body.join('');
          if (str.trim().startsWith('{') || str.trim().startsWith('[')) {
            body = JSON.parse(str);
          }
        } catch (e4) {
          // leave body as array
        }
      }
      // JSON as string (BOM, whitespace): MUST run before form-urlencoded — JSON with base64 contains "="
      // and would be mis-parsed as application/x-www-form-urlencoded if we split on "&" / first "=".
      if (typeof body === 'string') {
        const trimmed = body.trim().replace(/^\uFEFF/, '');
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || (trimmed.startsWith('"') && trimmed.length > 1)) {
          try {
            body = JSON.parse(trimmed);
          } catch (e6) {
            // leave body as string
          }
        }
      }
      // Fallback: application/x-www-form-urlencoded (e.g. date=...&zone=... or base64=...&type=jpg&...)
      if (typeof body === 'string' && body.includes('=') && (body.includes('&') || body.includes('='))) {
        const t = body.trim().replace(/^\uFEFF/, '');
        const looksLikeJson = t.startsWith('{') || t.startsWith('[');
        if (!looksLikeJson) {
          try {
            const parsed = {};
            for (const pair of body.split('&')) {
              const eq = pair.indexOf('=');
              if (eq !== -1) {
                const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '));
                const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
                parsed[k] = v;
              }
            }
            if (Object.keys(parsed).length > 0) {
              body = parsed;
            }
          } catch (e5) {
            // leave body as string
          }
        }
      }
    }
    
    // Normalize headers to lowercase so Vert/vert/VERT all work (API Gateway can pass different casing)
    const rawHeaders = event.headers || {};
    const headers = Object.fromEntries(
      Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v])
    );

    // Handle CORS preflight requests
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,cftoken,cfid,vert,s3domain',
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
    const result = await route.handler(request);

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
    console.error(`[${reqId}] ${reqMethod} ${reqPath} — ${error.constructor.name}: ${error.message}`);
    console.error(error.stack);
    if (error.cause) console.error('Caused by:', error.cause);

    // Publish error to SNS if configured
    await publishErrorToSNS(error, { requestId: reqId, path: reqPath, method: reqMethod });
    
    return createResponse(500, {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      requestId: event.requestContext?.requestId || 'unknown'
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

