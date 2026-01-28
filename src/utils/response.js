/**
 * Utility functions for creating API Gateway responses
 */

import { publishErrorToSNS } from './sns.js';

/**
 * Create a standardized API Gateway response
 */
export function createResponse(statusCode, body, contentType = 'application/json', headers = {}) {
  const defaultHeaders = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,cftoken,cfid,vert',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
  };

  // If body is a string and content type is not JSON, don't stringify
  const bodyString = contentType === 'application/json' 
    ? JSON.stringify(body)
    : (typeof body === 'string' ? body : JSON.stringify(body));

  return {
    statusCode,
    headers: { ...defaultHeaders, ...headers },
    body: bodyString,
  };
}

/**
 * Create a success response
 */
export function successResponse(data, statusCode = 200) {
  return createResponse(statusCode, { success: true, data });
}

/**
 * Create an error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {string|Error} details - Error details or Error object
 * @param {Object} context - Optional context for SNS notification (requestId, path, method, error)
 */
export function errorResponse(message, statusCode = 400, details = null, context = {}) {
  // If details is an Error object, extract message and stack
  let errorDetails = details;
  let error = context.error || null;
  
  if (details instanceof Error) {
    error = details;
    errorDetails = error.message;
  }
  
  // Publish to SNS if this is a server error (5xx) and we have an error object
  if (statusCode >= 500 && error instanceof Error) {
    // Don't await - fire and forget to avoid blocking the response
    publishErrorToSNS(error, {
      requestId: context.requestId || 'unknown',
      path: context.path || 'unknown',
      method: context.method || 'unknown'
    }).catch(snsError => {
      // Already logged in publishErrorToSNS, just prevent unhandled rejection
      console.error('SNS publish failed (non-blocking):', snsError);
    });
  }
  
  const body = { success: false, error: message };
  if (errorDetails) {
    body.details = errorDetails;
  }
  
  return createResponse(statusCode, body);
}

/**
 * Helper function to create error response with automatic SNS notification for 5xx errors
 * This is a convenience wrapper that extracts context from the request object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Error} error - The error object
 * @param {Object} request - The request object (to extract context)
 */
export function errorResponseWithSNS(message, statusCode, error, request) {
  return errorResponse(message, statusCode, error.message, {
    requestId: request.event?.requestContext?.requestId || 'unknown',
    path: request.path || 'unknown',
    method: request.method || 'unknown',
    error: error
  });
}