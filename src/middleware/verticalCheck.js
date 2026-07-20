/**
 * Vertical check middleware
 * Ensures the request has a valid vertical identifier
 */

import { errorResponse } from '../utils/response.js';

export function requireVertical(handler) {
  return async (request) => {
    const vert = request.headers?.vert || request.pathParameters?.vert;
    
    if (!vert) {
      return errorResponse('Vertical identifier required', 400);
    }
    
    request.vert = vert;
    return await handler(request);
  };
}

