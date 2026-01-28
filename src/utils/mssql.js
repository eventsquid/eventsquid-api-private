/**
 * MSSQL connection utility
 * Retrieves connection credentials from AWS Secrets Manager
 * Uses mssql package for connection management (matches working Lambda pattern)
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import sql from 'mssql';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });
let connectionPool = null;
let connectionPromise = null;
let mssqlErrorLogCount = 0; // Track how many times we've logged MSSQL errors
const MAX_MSSQL_ERROR_LOGS = 2; // Only log first 2 errors to reduce noise

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
 * Check if running in AWS Lambda (deployed) vs local development
 * @returns {boolean} True if deployed in AWS Lambda
 */
function isDeployed() {
  // AWS Lambda sets AWS_LAMBDA_FUNCTION_NAME automatically
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

/**
 * Get MSSQL connection credentials from environment variable or Secrets Manager
 */
async function getMssqlCredentials() {
  // When deployed, always use Secrets Manager (skip env vars)
  // For local development, allow direct credentials via environment variables
  if (!isDeployed() && process.env.MSSQL_CONNECTION_STRING) {
    // Parse connection string format: Server=host,port;Database=db;User Id=user;Password=pass;
    const connStr = process.env.MSSQL_CONNECTION_STRING;
    const credentials = {};
    
    // Parse connection string
    connStr.split(';').forEach(part => {
      const [key, value] = part.split('=');
      if (key && value) {
        const normalizedKey = key.trim().toLowerCase();
        if (normalizedKey === 'server' || normalizedKey === 'data source') {
          const [host, port] = value.split(',');
          credentials.host = host.trim();
          credentials.port = port ? parseInt(port.trim()) : 1433;
        } else if (normalizedKey === 'database' || normalizedKey === 'initial catalog') {
          credentials.database = value.trim();
        } else if (normalizedKey === 'user id' || normalizedKey === 'uid') {
          credentials.username = value.trim();
        } else if (normalizedKey === 'password' || normalizedKey === 'pwd') {
          credentials.password = value.trim();
        }
      }
    });
    
    if (!credentials.username || !credentials.password || !credentials.host) {
      throw new Error('MSSQL_CONNECTION_STRING missing required fields: Server, User Id, Password');
    }
    
    console.log('Using MSSQL_CONNECTION_STRING from environment variable');
    return {
      username: credentials.username,
      password: credentials.password,
      host: credentials.host,
      port: credentials.port || 1433,
      database: credentials.database || 'eventsquid'
    };
  }
  
  // When deployed, always use Secrets Manager (skip env vars)
  // Alternative: Use individual environment variables (local dev only)
  if (!isDeployed() && process.env.MSSQL_HOST && process.env.MSSQL_USERNAME && process.env.MSSQL_PASSWORD) {
    console.log('Using MSSQL credentials from individual environment variables');
    return {
      username: process.env.MSSQL_USERNAME,
      password: process.env.MSSQL_PASSWORD,
      host: process.env.MSSQL_HOST,
      port: parseInt(process.env.MSSQL_PORT || '1433'),
      database: process.env.MSSQL_DATABASE || 'eventsquid'
    };
  }

  // Use Secrets Manager (required when deployed, fallback for local dev)
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
    // In local dev, provide helpful error message
    if (process.env.NODE_ENV === 'development') {
      console.error('Tip: Set MSSQL_CONNECTION_STRING or MSSQL_HOST/USERNAME/PASSWORD environment variables');
      console.error('   MSSQL features will be unavailable in local dev without credentials');
    }
    throw new Error(`Failed to retrieve MSSQL credentials: ${error.message}`);
  }
}

/**
 * Connect to MSSQL (with connection pooling handled by mssql package)
 * Returns the sql module for creating requests
 */
export async function connectToMssql() {
  // Return existing connection if available and connected
  // mssql package manages connection pool internally
  if (connectionPool) {
    try {
      // Check if pool is healthy (mssql package exposes .healthy property)
      if (connectionPool.healthy !== false) {
        return sql;
      }
      // Pool is unhealthy, reset and reconnect
      connectionPool = null;
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
      
      // Debug: Log credentials (without password) in local dev
      if (process.env.NODE_ENV === 'development') {
        console.log(`📋 MSSQL Credentials: host=${credentials.host}, port=${credentials.port}, database=${credentials.database}, username=${credentials.username ? '***' : 'MISSING!'}`);
        if (!credentials.username || !credentials.password) {
          throw new Error(`MSSQL credentials incomplete: username=${!!credentials.username}, password=${!!credentials.password}`);
        }
      }

      // Build config matching working Lambda pattern
      const isLocalDev = process.env.NODE_ENV === 'development';
      const isDeployedEnv = isDeployed();
      
      // AWS RDS requires SSL but certificate validation may fail without proper CA certificates
      // trustServerCertificate: true allows RDS certificates to be accepted
      // This is safe for AWS RDS as the connection is still encrypted (encrypt: true)
      // In production, you could use cryptoCredentialsDetails with RDS CA cert for better security
      const config = {
        user: credentials.username,
        password: credentials.password,
        server: credentials.host,
        database: credentials.database || 'eventsquid',
        port: credentials.port || 1433,
        options: {
          enableArithAbort: true,
          encrypt: isDeployedEnv ? true : false, // Always encrypt when deployed (AWS RDS requires it)
          trustServerCertificate: isDeployedEnv ? true : isLocalDev, // Always trust RDS certificates in AWS, allow self-signed in local dev
          connectionTimeout: isLocalDev ? 10000 : 15000,
          requestTimeout: isLocalDev ? 30000 : 30000
        },
        pool: {
          max: isLocalDev ? 5 : 75,
          min: isLocalDev ? 1 : 5,
          idleTimeoutMillis: 30000
        }
      };
      
      // Debug: Log the actual config being used (without password)
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔧 MSSQL Config: server=${config.server}, port=${config.port}, database=${config.database}`);
        console.log(`   user=${config.user ? '***' : 'MISSING!'}`);
        console.log(`   SSL: encrypt=${config.options.encrypt}, trustServerCertificate=${config.options.trustServerCertificate}`);
      } else if (isDeployedEnv) {
        // Log SSL config in AWS for debugging
        console.log(`🔧 MSSQL Config (AWS): server=${config.server}, port=${config.port}, database=${config.database}`);
        console.log(`   SSL: encrypt=${config.options.encrypt}, trustServerCertificate=${config.options.trustServerCertificate}`);
      }

      // Connect using mssql package (handles pooling automatically)
      // sql.connect() returns a ConnectionPool promise
      console.log('🔄 Connecting to MSSQL...');
      connectionPool = await sql.connect(config);
      console.log('✅ Successfully connected to MSSQL');
      
      connectionPromise = null;
      return sql;
    } catch (error) {
      connectionPromise = null;
      // In local dev, provide helpful error message but don't crash
      if (process.env.NODE_ENV === 'development') {
        if (mssqlErrorLogCount < MAX_MSSQL_ERROR_LOGS) {
          console.error('⚠️  MSSQL connection error (local dev):', error.message);
          mssqlErrorLogCount++;
        }
        // Return sql module anyway - callers can check connection status
        return sql;
      }
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
 * Get a connection for a specific vertical/database
 * Returns the sql module for creating requests
 * Note: Individual queries should include USE statements to switch databases
 * @param {string} vert - Vertical code (cn, es, fd, ft, ir, kt, ln)
 * @returns {Promise} sql module for creating requests
 */
export async function getConnection(vert = null) {
  // Ensure connection is established
  await connectToMssql();
  // Return sql module - callers create new sql.Request() for each query
  return sql;
}

/**
 * Close MSSQL connection pool (useful for cleanup)
 */
export async function closeMssqlConnection() {
  if (connectionPool) {
    try {
      await connectionPool.close();
      connectionPool = null;
      console.log('MSSQL connection pool closed');
    } catch (error) {
      console.error('Error closing MSSQL connection pool:', error);
    }
  }
}

// Export TYPES for use in services
// mssql package exports types as sql.Int, sql.VarChar, etc.
// For backward compatibility, export TYPES object that maps to sql types
export const TYPES = {
  Int: sql.Int,
  VarChar: sql.VarChar,
  NVarChar: sql.NVarChar,
  Date: sql.Date,
  DateTime: sql.DateTime,
  Bit: sql.Bit,
  Float: sql.Float,
  TinyInt: sql.TinyInt,
  Decimal: sql.Decimal,
  BigInt: sql.BigInt,
  Text: sql.Text,
  NText: sql.NText,
  Image: sql.Image,
  SmallInt: sql.SmallInt,
  Real: sql.Real,
  UniqueIdentifier: sql.UniqueIdentifier,
  SmallDateTime: sql.SmallDateTime,
  Time: sql.Time,
  DateTime2: sql.DateTime2,
  DateTimeOffset: sql.DateTimeOffset,
  Money: sql.Money,
  SmallMoney: sql.SmallMoney,
  Numeric: sql.Numeric
};
