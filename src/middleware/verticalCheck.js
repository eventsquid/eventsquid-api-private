/**
 * Vertical check middleware
 * Ensures the request has a valid vertical identifier
 */

import { errorResponse } from '../utils/response.js';

export function requireVertical(handler) {
  return async (request) => {
    const vert = request.headers?.vert || request.pathParameters?.vert;
    
    if (!vert) {
      console.log('[requireVertical] 400: Vertical identifier required. path:', request.path, 'pathParameters:', JSON.stringify(request.pathParameters));
      return errorResponse('Vertical identifier required', 400);
    }
    
    request.vert = vert;
    return await handler(request);
  };
}

