/**
 * Authentication middleware for Lambda
 * Handles session validation via cftoken/cfid or devtoken
 */

import _authService from '../services/AuthService.js';
import { errorResponse } from '../utils/response.js';

export async function authenticate(request) {
  // Pre-Flight OPTIONS Request
  if (request.method === 'OPTIONS') {
    request.session = null;
    return { authenticated: true, session: null };
  }

  const headers = request.headers || {};
  let token = '';
  let session = null;

  // Parse the token and validate session
  // Session _id format in MongoDB is: cfid_cftoken (simple concatenation)
  if (headers.cftoken && headers.cfid) {
    token = `${headers.cfid}_${headers.cftoken}`;

    // Grab session data using cftoken and cfid
    session = await _authService.getSession(token);

    if (!session) {
      throw new Error('Invalid Session');
    }

    // Set session on request object
    request.session = session;
    request.token = token;
    return { authenticated: true, session, token };
  }
  
  // Use Dev Token to validate
  if (headers.devtoken) {
    const valid = await _authService.validateDevToken(headers.devtoken);
    
    if (!valid) {
      throw new Error('Invalid Dev Token');
    }
    
    request.session = null;
    request.devToken = true;
    return { authenticated: true, session: null, devToken: true };
  }
  
  // Allow cron runs
  if (headers.cronrun) {
    request.session = null;
    request.cronRun = true;
    return { authenticated: true, session: null, cronRun: true };
  }
  
  throw new Error('Could not construct session identifier');
}

/**
 * Check session if available (optional authentication)
 * Sets session to empty object if not available
 */
export async function checkSession(request) {
  const headers = request.headers || {};
  let token = '';
  let session = null;

  // Parse the token and validate session
  // Session _id format in MongoDB is: cfid_cftoken (simple concatenation)
  if (headers.cftoken && headers.cfid) {
    token = `${headers.cfid}_${headers.cftoken}`;

    // Grab session data using cftoken and cfid
    session = await _authService.getSession(token);

    // Set the request session (empty object if no session)
    request.session = session || {};
    request.token = token;
  } else {
    // There was no session
    request.session = {};
    request.token = '';
  }
}

/**
 * Check vertical identifier (used with authenticate)
 * Sets request.vert from headers or path parameters
 */
export async function verticalCheck(request) {
  const vert = request.headers?.vert || request.pathParameters?.vert;
  
  if (!vert) {
    throw new Error('Vertical identifier required');
  }
  
  request.vert = vert;
}

/**
 * Middleware wrapper for routes that require authentication
 */
export function requireAuth(handler) {
  return async (request) => {
    try {
      const authResult = await authenticate(request);
      request.session = authResult.session;
      request.token = authResult.token;
      request.devToken = authResult.devToken;
      request.cronRun = authResult.cronRun;
      
      return await handler(request);
    } catch (error) {
      console.error('Authentication error:', error);
      return errorResponse(error.message || 'Unauthorized', 401);
    }
  };
}

