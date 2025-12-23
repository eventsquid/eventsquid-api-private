/**
 * MSSQL connection utility
 * Retrieves connection credentials from AWS Secrets Manager
 * Uses tedious-connection-pool and tedious-promises for connection management
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import ConnectionPool from 'tedious-connection-pool';
import { TYPES } from 'tedious';
import { createRequire } from 'module';

// tedious-promises is CommonJS, so we use createRequire to import it
const require = createRequire(import.meta.url);
const tp = require('tedious-promises');

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });
let connectionPool = null;
let connectionPromise = null;

// Database names by vertical (from old CONSTANTS._s)
const DATABASES_BY_VERTICAL = {
  cn: 'connect',
  es: 'eventsquid',
  fd: 'rcflightdeck',
  ft: 'fitsquid',
  ir: 'inreach',
  kt: 'kindertales',
  ln: 'launchsquid'
};

/**
 * Get MSSQL connection credentials from Secrets Manager
 */
async function getMssqlCredentials() {
  const secretName = process.env.MSSQL_SECRET_NAME || 'primary-mssql/event-squid';

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);
    
    const secret = JSON.parse(response.SecretString);
    
    // Extract credentials from key/value secret
    const username = secret.username || secret.userName || secret.user;
    const password = secret.password || secret.pwd;
    const host = secret.host || secret.server;
    const port = secret.port || 1433;
    const database = secret.database || secret.db;
    
    if (!username || !password || !host) {
      throw new Error('Missing required MSSQL credentials: username, password, or host');
    }
    
    return {
      username,
      password,
      host,
      port,
      database
    };
  } catch (error) {
    console.error('Error retrieving MSSQL secret:', error);
    throw new Error(`Failed to retrieve MSSQL credentials: ${error.message}`);
  }
}

/**
 * Connect to MSSQL (with connection pooling)
 */
export async function connectToMssql() {
  // Return existing connection pool if available
  if (connectionPool) {
    try {
      // Check if pool is still valid
      if (connectionPool.healthy) {
        return tp;
      }
    } catch (error) {
      // Connection lost, reset and reconnect
      connectionPool = null;
    }
  }

  // Prevent multiple simultaneous connection attempts
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      const credentials = await getMssqlCredentials();
      
      // Pool configuration
      const poolConfig = {
        min: 5,
        max: 75,
        log: false // Set to true for debugging
      };

      // Database configuration
      const dbConfig = {
        userName: credentials.username,
        password: credentials.password,
        server: credentials.host,
        options: {
          port: credentials.port,
          database: credentials.database || 'eventsquid', // Default database
          encrypt: true, // Use encryption for Azure SQL
          trustServerCertificate: false, // Set to true for self-signed certificates
          rowCollectionOnRequestCompletion: true,
          enableArithAbort: true
        }
      };

      // Create connection pool
      connectionPool = new ConnectionPool(poolConfig, dbConfig);
      
      // Set up error handling
      connectionPool.on('error', (error) => {
        console.error('MSSQL Connection Pool Error:', error);
      });

      // Set the connection pool for tedious-promises
      await tp.setConnectionPool(connectionPool);
      
      console.log('Successfully connected to MSSQL');
      connectionPromise = null;
      return tp;
    } catch (error) {
      connectionPromise = null;
      console.error('MSSQL connection error:', error);
      throw error;
    }
  })();

  return connectionPromise;
}

/**
 * Get database name for a vertical
 */
export function getDatabaseName(vert) {
  if (!vert) {
    return 'eventsquid'; // Default database
  }
  
  const normalizedVert = vert.toLowerCase();
  return DATABASES_BY_VERTICAL[normalizedVert] || 'eventsquid';
}

/**
 * Execute a SQL query
 * @param {string} query - SQL query string
 * @param {Array} parameters - Query parameters (optional)
 * @param {string} database - Database name (optional, defaults to eventsquid)
 * @returns {Promise} Query result
 */
export async function executeQuery(query, parameters = [], database = null) {
  const connection = await connectToMssql();
  
  // If database is specified, switch to it
  if (database) {
    await connection.sql(`USE [${database}]`).execute();
  }
  
  // Execute the query with parameters
  if (parameters && parameters.length > 0) {
    return await connection.sql(query).parameter(...parameters).execute();
  } else {
    return await connection.sql(query).execute();
  }
}

/**
 * Get a connection for a specific vertical/database
 * Note: The connection object (tp) is shared, but we'll include USE statements in queries
 * @param {string} vert - Vertical code (cn, es, fd, ft, ir, kt, ln)
 * @returns {Promise} Connection object (tedious-promises instance)
 */
export async function getConnection(vert = null) {
  // Return the shared connection pool instance
  // Individual queries will include USE statements to switch databases
  return await connectToMssql();
}

/**
 * Close MSSQL connection pool (useful for cleanup)
 */
export async function closeMssqlConnection() {
  if (connectionPool) {
    try {
      await connectionPool.drain();
      connectionPool = null;
      console.log('MSSQL connection pool closed');
    } catch (error) {
      console.error('Error closing MSSQL connection pool:', error);
    }
  }
}

// Export TYPES for use in services
export { TYPES };

