/**
 * Local development server for testing Lambda function
 * Mimics API Gateway HTTP API format
 * 
 * Usage: npm run dev
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { handler } from './src/handler.js';

// Handle Node.js 24 compatibility issues with tedious-connection-pool in local dev
if (process.env.NODE_ENV === 'development') {
  process.on('uncaughtException', (error) => {
    // Silently suppress MSSQL/Tedious Node.js 24 compatibility errors
    if (error.message && error.message.includes('createSecurePair')) {
      // Silently ignore - don't log, don't crash
      return;
    }
    // Re-throw other errors
    throw error;
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Increase payload size limit to 50MB (matching API Gateway limits)
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * Convert Express request to API Gateway HTTP API event format
 */
function createApiGatewayEvent(req) {
  const protocol = req.protocol;
  const host = req.get('host');
  const path = req.path;
  const queryString = req.url.split('?')[1] || '';
  
  // Parse query parameters
  const queryStringParameters = {};
  if (queryString) {
    queryString.split('&').forEach(param => {
      const [key, value] = param.split('=');
      if (key) {
        queryStringParameters[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    });
  }

  // Parse path parameters (basic - you may need to enhance this)
  const pathParameters = {};
  
  return {
    version: '2.0',
    routeKey: `${req.method} ${path}`,
    rawPath: path,
    rawQueryString: queryString,
    headers: req.headers,
    requestContext: {
      accountId: '123456789012',
      apiId: 'local-api',
      domainName: host,
      domainPrefix: 'local',
      http: {
        method: req.method,
        path: path,
        protocol: `${protocol.toUpperCase()}/${req.httpVersion}`,
        sourceIp: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent') || ''
      },
      requestId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      routeKey: `${req.method} ${path}`,
      stage: 'local',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    body: req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
    isBase64Encoded: false,
    pathParameters: pathParameters,
    queryStringParameters: Object.keys(queryStringParameters).length > 0 ? queryStringParameters : null,
    stageVariables: null
  };
}

/**
 * Convert Lambda response to Express response
 */
async function sendResponse(lambdaResponse, res) {
  // Handle Lambda response format
  if (lambdaResponse.statusCode) {
    res.status(lambdaResponse.statusCode);
    
    // Set headers
    if (lambdaResponse.headers) {
      Object.entries(lambdaResponse.headers).forEach(([key, value]) => {
        res.set(key, value);
      });
    }
    
    // Send body
    if (lambdaResponse.body) {
      // Handle base64-encoded responses (e.g., images)
      if (lambdaResponse.isBase64Encoded) {
        const buffer = Buffer.from(lambdaResponse.body, 'base64');
        res.send(buffer);
      } else {
        try {
          // Try to parse as JSON, otherwise send as-is
          const body = JSON.parse(lambdaResponse.body);
          res.json(body);
        } catch (e) {
          res.send(lambdaResponse.body);
        }
      }
    } else {
      res.end();
    }
  } else {
    // If handler returns something else, try to send it
    res.json(lambdaResponse);
  }
}

// Catch-all route handler
app.all('*', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    
    // Create API Gateway event
    const event = createApiGatewayEvent(req);
    
    // Call Lambda handler
    const response = await handler(event);
    
    // Send response
    await sendResponse(response, res);
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Local Lambda server running!');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('Example requests:');
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log(`  GET  http://localhost:${PORT}/dev/health`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});
