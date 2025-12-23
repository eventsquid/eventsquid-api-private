/**
 * Authentication middleware for Lambda
 * Handles session validation via cftoken/cfid or devtoken
 */

import AuthService from '../services/AuthService.js';
import { errorResponse } from '../utils/response.js';

const _authService = new AuthService();

export async function authenticate(request) {
  // Pre-Flight OPTIONS Request
  if (request.method === 'OPTIONS') {
    return { authenticated: true, session: null };
  }

  const headers = request.headers || {};
  let token = '';
  let session = null;

  // Parse the token and validate session
  if (headers.cftoken && headers.cfid) {
    token = `${headers.cfid}_${headers.cftoken}`;
    
    // Grab session data using cftoken and cfid
    session = await _authService.getSession(token);
    
    if (!session) {
      throw new Error('Invalid Session');
    }
    
    return { authenticated: true, session, token };
  }
  
  // Use Dev Token to validate
  if (headers.devtoken) {
    const valid = await _authService.validateDevToken(headers.devtoken);
    
    if (!valid) {
      throw new Error('Invalid Dev Token');
    }
    
    return { authenticated: true, session: null, devToken: true };
  }
  
  // Allow cron runs
  if (headers.cronrun) {
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

