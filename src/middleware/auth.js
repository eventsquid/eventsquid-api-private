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
  if (headers.cftoken && headers.cfid) {
    // Session _id format in MongoDB is: affiliate_id_token_part
    // Handle two formats:
    // 1. With prefix: cfid="prefix-affiliate_id", cftoken="prefix-token_part"
    // 2. Without prefix: cfid="affiliate_id", cftoken="token_part"
    
    let affiliateID;
    let tokenPart;
    
    // Extract affiliate_id from cfid
    if (headers.cfid.includes('-')) {
      // Format: prefix-affiliate_id
      const cfidParts = headers.cfid.split('-');
      affiliateID = cfidParts[cfidParts.length - 1];
    } else {
      // Format: affiliate_id (no prefix)
      affiliateID = headers.cfid;
    }
    
    // Extract token part from cftoken
    if (headers.cftoken.includes('-')) {
      // Check if it has a prefix (first part matches cfid prefix pattern)
      // If cftoken starts with a long prefix, extract after first dash
      // Otherwise, use the full cftoken as token_part
      const cftokenParts = headers.cftoken.split('-');
      // If cfid had a prefix, cftoken likely does too - extract after first dash
      // If cfid had no prefix, use full cftoken
      if (headers.cfid.includes('-')) {
        tokenPart = cftokenParts.slice(1).join('-');
      } else {
        // No prefix in cfid, so use full cftoken as token_part
        tokenPart = headers.cftoken;
      }
    } else {
      // No dashes in cftoken, use as-is
      tokenPart = headers.cftoken;
    }
    
    // Construct token as: affiliate_id_token_part
    token = `${affiliateID}_${tokenPart}`;
    
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
  if (headers.cftoken && headers.cfid) {
    // Session _id format in MongoDB is: affiliate_id_token_part
    // Handle two formats:
    // 1. With prefix: cfid="prefix-affiliate_id", cftoken="prefix-token_part"
    // 2. Without prefix: cfid="affiliate_id", cftoken="token_part"
    
    let affiliateID;
    let tokenPart;
    
    // Extract affiliate_id from cfid
    if (headers.cfid.includes('-')) {
      // Format: prefix-affiliate_id
      const cfidParts = headers.cfid.split('-');
      affiliateID = cfidParts[cfidParts.length - 1];
    } else {
      // Format: affiliate_id (no prefix)
      affiliateID = headers.cfid;
    }
    
    // Extract token part from cftoken
    if (headers.cftoken.includes('-')) {
      const cftokenParts = headers.cftoken.split('-');
      // If cfid had a prefix, cftoken likely does too - extract after first dash
      // If cfid had no prefix, use full cftoken
      if (headers.cfid.includes('-')) {
        tokenPart = cftokenParts.slice(1).join('-');
      } else {
        // No prefix in cfid, so use full cftoken as token_part
        tokenPart = headers.cftoken;
      }
    } else {
      // No dashes in cftoken, use as-is
      tokenPart = headers.cftoken;
    }
    
    // Construct token as: affiliate_id_token_part
    token = `${affiliateID}_${tokenPart}`;
    
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

