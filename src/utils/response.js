/**
 * Utility functions for creating API Gateway responses
 */

/**
 * Create a standardized API Gateway response
 */
export function createResponse(statusCode, body, contentType = 'application/json', headers = {}) {
  const defaultHeaders = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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
 */
export function errorResponse(message, statusCode = 400, details = null) {
  const body = { success: false, error: message };
  if (details) {
    body.details = details;
  }
  return createResponse(statusCode, body);
}

