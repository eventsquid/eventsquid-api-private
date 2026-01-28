/**
 * MongoDB connection utility
 * Retrieves connection string from AWS Secrets Manager
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { MongoClient } from 'mongodb';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });
let mongoClient = null;
let mongoClients = {}; // Cache for multiple vertical connections
let connectionPromise = null;

/**
 * Check if running in AWS Lambda (deployed) vs local development
 * @returns {boolean} True if deployed in AWS Lambda
 */
function isDeployed() {
  // AWS Lambda sets AWS_LAMBDA_FUNCTION_NAME automatically
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

// Export mongoClients for services that need to check multiple databases
export function getMongoClient(key) {
  return mongoClients[key];
}

/**
 * Get MongoDB connection string from Secrets Manager or environment variable
 * @param {string} dbName - Database name (e.g., 'cm' for common database)
 */
async function getMongoConnectionString(dbName = null) {
  // When deployed, always use Secrets Manager (skip env vars)
  if (!isDeployed()) {
    // For local development, allow direct connection string override
    // For common database (cm), check for separate connection string
    if (dbName === 'cm' && process.env.MONGO_COMMON_CONNECTION_STRING) {
      console.log('Using MONGO_COMMON_CONNECTION_STRING from environment variable for cm database');
      return process.env.MONGO_COMMON_CONNECTION_STRING;
    }
    
    // For local development, allow direct connection string override
    if (process.env.MONGO_CONNECTION_STRING) {
      console.log('Using MONGO_CONNECTION_STRING from environment variable');
      return process.env.MONGO_CONNECTION_STRING;
    }
  }

  const secretName = process.env.MONGO_SECRET_NAME || 'mongodb/eventsquid';

  try {
    console.log(`Attempting to retrieve MongoDB secret: ${secretName}`);
    const command = new GetSecretValueCommand({ SecretId: secretName });
    console.log(`Sending GetSecretValueCommand for secret: ${secretName}`);
    
    // Add timeout wrapper for Secrets Manager call (15 seconds)
    const secretPromise = secretsClient.send(command);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Secrets Manager API call timeout after 15s for secret: ${secretName}`));
      }, 15000);
    });
    
    const response = await Promise.race([secretPromise, timeoutPromise]);
    console.log(`Successfully retrieved secret: ${secretName}`);
    
    // The secret may be a JSON object or a plain string (connection string)
    let secretValue = response.SecretString;
    
    // Try to parse as JSON first
    try {
      const secret = JSON.parse(secretValue);
      
      // MongoDB secrets are key/value pairs with connectionString as the key
      if (secret.connectionString) {
        return secret.connectionString;
      } else if (secret.uri) {
        return secret.uri;
      } else if (secret.mongodb_uri) {
        return secret.mongodb_uri;
      } else {
        // Construct from individual components
        const { host, port, database, username, password } = secret;
        return `mongodb://${username}:${password}@${host}:${port || 27017}/${database}?authSource=admin`;
      }
    } catch (parseError) {
      // If parsing fails, assume the secret is the connection string directly
      // This handles cases where the secret is stored as: mongodb+srv://...
      return secretValue;
    }
  } catch (error) {
    console.error(`Error retrieving MongoDB secret ${secretName}:`, error.message);
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`MongoDB secret ${secretName} not found. Please create the secret in AWS Secrets Manager.`);
    }
    if (error.name === 'AccessDeniedException') {
      throw new Error(`Access denied to MongoDB secret ${secretName}. Check Lambda IAM role permissions.`);
    }
    // For local development, provide a helpful error message
    if (process.env.NODE_ENV === 'development') {
      console.error('Tip: Set MONGO_CONNECTION_STRING environment variable to use a direct connection string');
    }
    throw new Error(`Failed to retrieve MongoDB connection string: ${error.message}`);
  }
}

/**
 * Connect to MongoDB (with connection pooling)
 */
export async function connectToMongo() {
  // Return existing connection if available
  if (mongoClient) {
    try {
      await mongoClient.db().admin().ping();
      return mongoClient;
    } catch (error) {
      // Connection lost, reset and reconnect
      mongoClient = null;
    }
  }

  // Prevent multiple simultaneous connection attempts
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      console.log('Connecting to MongoDB using default connection...');
      const connectionString = await getMongoConnectionString();
      console.log('Retrieved MongoDB connection string (length:', connectionString.length, '), attempting connection...');
      
      const options = {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: isDeployed() ? 8000 : (process.env.NODE_ENV === 'development' ? 10000 : 5000), // Reduced for deployed
        socketTimeoutMS: 20000, // Reduced to fail faster
        connectTimeoutMS: isDeployed() ? 10000 : (process.env.NODE_ENV === 'development' ? 10000 : 5000), // Reduced for deployed
      };

      console.log('Creating MongoClient with options:', JSON.stringify({
        maxPoolSize: options.maxPoolSize,
        serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
        socketTimeoutMS: options.socketTimeoutMS,
        connectTimeoutMS: options.connectTimeoutMS
      }));
      
      mongoClient = new MongoClient(connectionString, options);
      console.log('MongoClient created, calling connect()...');
      
      // Add a timeout wrapper to ensure we don't hang forever (use 20s total to stay under Lambda timeout)
      const connectPromise = mongoClient.connect();
      const timeoutMs = 20000; // 20 seconds total timeout
      const connectTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`MongoDB connection timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      await Promise.race([connectPromise, connectTimeoutPromise]);
      
      console.log('Successfully connected to MongoDB');
      connectionPromise = null;
      return mongoClient;
    } catch (error) {
      connectionPromise = null;
      console.error('MongoDB connection error:', error.message);
      if (error.stack) {
        console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
      }
      throw error;
    }
  })();

  return connectionPromise;
}

/**
 * Map vertical code to full vertical name for secret lookup
 * @param {string} vert - 2-letter vertical code
 * @returns {string} Full vertical name in lowercase
 */
function getVerticalNameFromCode(vert) {
  const vertCode = vert.toLowerCase();
  
  switch (vertCode) {
    case 'es':
      return 'eventsquid';
    case 'ln':
      return 'launchsquid';
    case 'rc':
      return 'rcflightdeck';
    case 'kt':
      return 'kindertales';
    case 'ir':
      return 'inreach';
    case 'fi':
      return 'fitsquid';
    case 'cn':
      return 'connect';
    default:
      return 'eventsquid'; // Default fallback
  }
}

/**
 * Connect to MongoDB for a specific vertical
 * @param {string} vert - Vertical code (es, ln, rc, kt, ir, fi, cn)
 * @returns {Promise<MongoClient>}
 */
export async function connectToMongoByVertical(vert) {
  if (!vert) {
    return await connectToMongo(); // Default connection
  }

  const normalizedVert = vert.toLowerCase();
  
  // Return cached connection if available
  if (mongoClients[normalizedVert]) {
    try {
      await mongoClients[normalizedVert].db().admin().ping();
      return mongoClients[normalizedVert];
    } catch (error) {
      // Connection lost, reset and reconnect
      delete mongoClients[normalizedVert];
    }
  }

  // When deployed, always use Secrets Manager (skip env vars)
  // For local development, use MONGO_CONNECTION_STRING if available (bypasses Secrets Manager)
  if (!isDeployed() && process.env.MONGO_CONNECTION_STRING) {
    console.log(`Using MONGO_CONNECTION_STRING for vertical: ${normalizedVert}`);
    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: process.env.NODE_ENV === 'development' ? 10000 : 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: process.env.NODE_ENV === 'development' ? 10000 : 5000,
    };

    const client = new MongoClient(process.env.MONGO_CONNECTION_STRING, options);
    await client.connect();
    
    mongoClients[normalizedVert] = client;
    console.log(`Successfully connected to MongoDB for vertical: ${normalizedVert}`);
    return client;
  }

  // Map vert code to full vertical name and construct secret name
  // Format: mongodb/{verticalname} (e.g., mongodb/eventsquid, mongodb/launchsquid)
  const verticalName = getVerticalNameFromCode(normalizedVert);
  
  // Priority: 1) Env var for specific vert, 2) Mapped secret name, 3) Default env var, 4) Default secret
  const secretName = process.env[`MONGO_SECRET_NAME_${normalizedVert.toUpperCase()}`] || 
                    `mongodb/${verticalName}` ||
                    process.env.MONGO_SECRET_NAME || 
                    'mongodb/eventsquid';

  try {
    console.log(`Attempting to retrieve MongoDB secret: ${secretName} for vertical: ${normalizedVert}`);
    const command = new GetSecretValueCommand({ SecretId: secretName });
    console.log(`Sending GetSecretValueCommand for secret: ${secretName} (vertical: ${normalizedVert})`);
    
    // Add timeout wrapper for Secrets Manager call (15 seconds)
    const secretPromise = secretsClient.send(command);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Secrets Manager API call timeout after 15s for secret: ${secretName}`));
      }, 15000);
    });
    
    const response = await Promise.race([secretPromise, timeoutPromise]);
    console.log(`Successfully retrieved secret: ${secretName} for vertical: ${normalizedVert}`);
    
    // The secret may be a JSON object or a plain string (connection string)
    let secretValue = response.SecretString;
    
    // Try to parse as JSON first
    let connectionString;
    try {
      const secret = JSON.parse(secretValue);
      
      // MongoDB secrets are key/value pairs with connectionString as the key
      if (secret.connectionString) {
        connectionString = secret.connectionString;
      } else if (secret.uri) {
        connectionString = secret.uri;
      } else if (secret.mongodb_uri) {
        connectionString = secret.mongodb_uri;
      } else {
        const { host, port, database, username, password } = secret;
        connectionString = `mongodb://${username}:${password}@${host}:${port || 27017}/${database}?authSource=admin`;
      }
    } catch (parseError) {
      // If parsing fails, assume the secret is the connection string directly
      // This handles cases where the secret is stored as: mongodb+srv://...
      connectionString = secretValue;
    }

    console.log(`Retrieved MongoDB secret for ${normalizedVert} (connection string length: ${connectionString.length}), attempting connection...`);
    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: isDeployed() ? 8000 : 5000, // Reduced for deployed
      socketTimeoutMS: 20000, // Reduced to fail faster
      connectTimeoutMS: isDeployed() ? 10000 : 5000, // Reduced for deployed
    };

    console.log(`Creating MongoClient for vertical ${normalizedVert} with options:`, JSON.stringify({
      maxPoolSize: options.maxPoolSize,
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
      socketTimeoutMS: options.socketTimeoutMS,
      connectTimeoutMS: options.connectTimeoutMS
    }));
    
    const client = new MongoClient(connectionString, options);
    console.log(`MongoClient created for ${normalizedVert}, calling connect()...`);
    
    // Add a timeout wrapper to ensure we don't hang forever (use 20s total to stay under Lambda timeout)
    const connectPromise = client.connect();
    const timeoutMs = 20000; // 20 seconds total timeout
    const connectTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`MongoDB connection timeout for vertical ${normalizedVert} after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    await Promise.race([connectPromise, connectTimeoutPromise]);
    
    mongoClients[normalizedVert] = client;
    console.log(`Successfully connected to MongoDB for vertical: ${normalizedVert}`);
    return client;
  } catch (error) {
    console.error(`Error connecting to MongoDB for vertical ${normalizedVert} (secret: ${secretName}):`, error.message);
    if (error.name === 'ResourceNotFoundException') {
      console.error(`Secret ${secretName} not found in AWS Secrets Manager`);
      throw new Error(`MongoDB secret ${secretName} not found. Please create the secret in AWS Secrets Manager.`);
    }
    if (error.name === 'AccessDeniedException') {
      console.error(`Access denied to secret ${secretName}. Check IAM permissions.`);
      throw new Error(`Access denied to MongoDB secret ${secretName}. Check Lambda IAM role permissions.`);
    }
    // Don't fallback to default connection when deployed - fail fast
    if (isDeployed()) {
      throw new Error(`Failed to connect to MongoDB for vertical ${normalizedVert}: ${error.message}`);
    }
    // Only fallback in local dev
    console.warn(`Falling back to default connection for vertical ${normalizedVert}`);
    return await connectToMongo();
  }
}

/**
 * Get database instance
 * @param {string} dbName - Optional database name (defaults to eventsquid, use 'cm' for common)
 * @param {string} vert - Optional vertical code (cm, cn, es, fd, ft, ir, kt, ln)
 * @returns {Promise<Database>}
 */
export async function getDatabase(dbName = null, vert = null) {
  let client;
  
  // Special handling for 'cm' (common) database
  // Check if dbName is 'cm' OR if vert is 'cm' (some services pass it as vertical)
  const isCommonDb = dbName === 'cm' || vert === 'cm';
  
  console.log(`[getDatabase] Called with dbName=${dbName}, vert=${vert}, isCommonDb=${isCommonDb}, isDeployed=${isDeployed()}`);
  
  if (isCommonDb) {
    console.log(`[getDatabase] Processing 'cm' database request...`);
    // When deployed, always use Secrets Manager (skip env vars)
    // For local development, use common connection string if available
    if (!isDeployed() && process.env.MONGO_COMMON_CONNECTION_STRING) {
      // Use the connection string as-is (it should already point to the 'cm' database)
      const commonConnectionString = process.env.MONGO_COMMON_CONNECTION_STRING;
      
      const options = {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: process.env.NODE_ENV === 'development' ? 10000 : 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: process.env.NODE_ENV === 'development' ? 10000 : 5000,
      };
      
      // Use cached common client if available
      if (!mongoClients['cm']) {
        console.log('Connecting to MongoDB common database using MONGO_COMMON_CONNECTION_STRING');
        console.log('Connection string (sanitized):', commonConnectionString.replace(/:[^:@]+@/, ':****@'));
        const commonClient = new MongoClient(commonConnectionString, options);
        await commonClient.connect();
        mongoClients['cm'] = commonClient;
        console.log('Successfully connected to MongoDB common database');
      }
      
      // Extract database name from connection string - use that, not hardcoded 'cm'
      const dbMatch = commonConnectionString.match(/\/([^\/\?]+)(\?|$)/);
      const dbNameFromConnection = dbMatch ? dbMatch[1] : 'cm';
      const dbNameToUse = dbNameFromConnection !== 'unknown' && dbNameFromConnection !== '' 
        ? dbNameFromConnection 
        : 'cm';
      
      console.log(`[getDatabase] Local dev: Using database ${dbNameToUse} from connection string`);
      
      // Always use database from connection string - hard fail if not accessible
      const cmDb = mongoClients['cm'].db(dbNameToUse);
      // Test access using a simple database command (like deployed version)
      try {
        await cmDb.command({ ping: 1 });
        console.log(`[getDatabase] Successfully accessed ${dbNameToUse} database`);
        return cmDb;
      } catch (cmError) {
        // Hard fail - no fallback to other databases
        console.error(`[getDatabase] Cannot access ${dbNameToUse} database. Connection string points to: ${dbNameFromConnection}`);
        throw new Error(`Cannot access ${dbNameToUse} database with provided connection string. Error: ${cmError.message}`);
      }
    } else {
      // When deployed, we MUST use mongodb/common secret for 'cm' database - no fallback allowed
      if (isDeployed()) {
        // MUST use mongodb/common secret for 'cm' database access
        console.log('Attempting to connect to MongoDB common database using Secrets Manager (mongodb/common)');
        // Declare cmSecretName outside try block so it's accessible in catch block
        const cmSecretName = process.env.MONGO_CM_SECRET_NAME || 'mongodb/common';
        try {
          // First try a cm-specific secret (mongodb/common)
          console.log(`Attempting to retrieve 'cm' database secret: ${cmSecretName}`);
          const command = new GetSecretValueCommand({ SecretId: cmSecretName });
          console.log(`Sending GetSecretValueCommand for 'cm' secret: ${cmSecretName}`);
          
          // Add timeout wrapper for Secrets Manager call (15 seconds)
          const secretPromise = secretsClient.send(command);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Secrets Manager API call timeout after 15s for secret: ${cmSecretName}`));
            }, 15000);
          });
          
          const response = await Promise.race([secretPromise, timeoutPromise]);
          console.log(`Successfully retrieved 'cm' secret: ${cmSecretName}`);
          let secretValue = response.SecretString;
          
          // Log raw secret value (sanitized) for debugging
          const sanitizedSecret = typeof secretValue === 'string' 
            ? secretValue.replace(/:[^:@]+@/, ':****@') 
            : JSON.stringify(secretValue).replace(/:[^:@]+@/, ':****@');
          console.log(`[getDatabase] Raw secret value (sanitized, length: ${secretValue.length}): ${sanitizedSecret.substring(0, 200)}...`);
          
          let connectionString;
          try {
            const secret = JSON.parse(secretValue);
            console.log(`[getDatabase] Secret parsed as JSON. Keys: ${Object.keys(secret).join(', ')}`);
            // MongoDB secrets are key/value pairs with connectionString as the key
            if (secret.connectionString) {
              connectionString = secret.connectionString;
              console.log(`[getDatabase] Using connectionString from secret (length: ${connectionString.length})`);
            } else if (secret.uri) {
              connectionString = secret.uri;
              console.log(`[getDatabase] Using uri from secret (length: ${connectionString.length})`);
            } else if (secret.mongodb_uri) {
              connectionString = secret.mongodb_uri;
              console.log(`[getDatabase] Using mongodb_uri from secret (length: ${connectionString.length})`);
            } else {
              const { host, port, database, username, password } = secret;
              connectionString = `mongodb://${username}:${password}@${host}:${port || 27017}/${database || 'cm'}?authSource=admin`;
              console.log(`[getDatabase] Constructed connection string from secret components (host: ${host}, database: ${database || 'cm'})`);
            }
          } catch (parseError) {
            // If parsing fails, assume the secret is the connection string directly
            connectionString = secretValue;
            console.log(`[getDatabase] Secret is not JSON, using as direct connection string (length: ${connectionString.length})`);
          }
          
          console.log(`[getDatabase] Connection string for 'cm' database retrieved from ${cmSecretName}`);
          // Extract database name from connection string for logging and use
          // For mongodb+srv://, the database is after the last / and before ?
          const dbMatch = connectionString.match(/\/([^\/\?]+)(\?|$)/);
          const dbNameFromConnection = dbMatch ? dbMatch[1] : 'unknown';
          console.log(`[getDatabase] Database name in connection string: ${dbNameFromConnection}`);
          
          // Log full connection string (sanitized) for comparison with local
          const sanitizedConnection = connectionString.replace(/:[^:@]+@/, ':****@');
          console.log(`[getDatabase] Full connection string (sanitized): ${sanitizedConnection}`);
          
          // Extract and log key parts for debugging
          const authSourceMatch = connectionString.match(/authSource=([^&]+)/);
          const authSource = authSourceMatch ? authSourceMatch[1] : 'not specified';
          console.log(`[getDatabase] Connection string authSource: ${authSource}`);
          
          // Extract username - works for both mongodb:// and mongodb+srv://
          const userMatch = connectionString.match(/mongodb(\+srv)?:\/\/([^:]+):/);
          const username = userMatch ? userMatch[2] : 'not found';
          console.log(`[getDatabase] Connection string username: ${username}`);
          
          // Determine which database to use - prefer the one from connection string
          const dbNameToUse = dbNameFromConnection !== 'unknown' && dbNameFromConnection !== '' 
            ? dbNameFromConnection 
            : 'cm';
          console.log(`[getDatabase] Will use database: ${dbNameToUse}`);
          
          // Match working Lambda pattern EXACTLY: create new client each time, no caching
          // The working Lambda creates a fresh client for each request: new MongoClient(mongoConnectionString)
          // Then connects: await mongoClient.connect()
          // Add connection options with longer timeouts for VPC connections
          const connectionOptions = {
            serverSelectionTimeoutMS: 30000, // 30 seconds for VPC connections
            connectTimeoutMS: 30000,
            socketTimeoutMS: 30000,
          };
          
          console.log('[getDatabase] Creating new MongoDB client for common database (matching working Lambda - no cache)...');
          const commonClient = new MongoClient(connectionString, connectionOptions);
          
          console.log('[getDatabase] Connecting to MongoDB (explicit connect like working Lambda)...');
          const connectStartTime = Date.now();
          try {
            await commonClient.connect();
            const connectDuration = Date.now() - connectStartTime;
            console.log(`[getDatabase] Successfully connected to MongoDB (took ${connectDuration}ms)`);
          } catch (connectError) {
            const connectDuration = Date.now() - connectStartTime;
            console.error(`[getDatabase] Connection failed after ${connectDuration}ms:`, connectError.message);
            console.error(`[getDatabase] Connection string host: ${connectionString.match(/@([^/]+)/)?.[1] || 'unknown'}`);
            throw connectError;
          }
          
          // Get database handle
          console.log(`[getDatabase] Accessing database ${dbNameToUse} from common connection...`);
          const cmDb = commonClient.db(dbNameToUse);
          console.log(`[getDatabase] Returning database handle (database name: ${cmDb.databaseName})`);
          
          // Store client reference so we can close it later if needed
          // But don't cache it for reuse - match working Lambda pattern
          // Note: We're not closing here because the caller might need to use it
          // The working Lambda closes after use, but we'll let the connection pool handle it
          
          return cmDb;
        } catch (cmError) {
          console.error(`Failed to connect to 'cm' database using Secrets Manager (${cmSecretName}):`, cmError.message);
          // Clear any cached client on error
          if (mongoClients['cm']) {
            console.log('[getDatabase] Clearing cached client due to error...');
            try {
              await mongoClients['cm'].close();
            } catch (closeError) {
              // Ignore close errors
            }
            delete mongoClients['cm'];
          }
          if (cmError.name === 'ResourceNotFoundException') {
            console.error(`Secret ${cmSecretName} not found. Cannot access 'cm' database without this secret.`);
          } else if (cmError.stack) {
            console.error(`Error stack: ${cmError.stack.split('\n').slice(0, 3).join('\n')}`);
          }
          // When deployed, we MUST use mongodb/common for 'cm' database - don't fall back to eventsquid
          throw new Error(`Cannot access 'cm' database: ${cmSecretName} secret failed. Error: ${cmError.message}`);
        }
      } else {
        // When deployed, we MUST have mongodb/common secret for 'cm' database - HARD FAIL
        if (isDeployed()) {
          console.error('MONGO_COMMON_CONNECTION_STRING not set (deployed). Cannot access "cm" database without mongodb/common secret.');
          throw new Error('Cannot access "cm" database: mongodb/common secret is required when deployed');
        } else {
          // Local dev: HARD FAIL if no MONGO_COMMON_CONNECTION_STRING
          console.error('MONGO_COMMON_CONNECTION_STRING not set (local). Cannot access "cm" database without this environment variable.');
          throw new Error('Cannot access "cm" database: MONGO_COMMON_CONNECTION_STRING environment variable is required for local development');
        }
      }
    }
    // If we get here and isCommonDb is true, something went wrong - we should have returned or thrown above
    // This should never happen, but if it does, HARD FAIL
    throw new Error('Unexpected code path: isCommonDb is true but did not return or throw. This should never happen.');
  }
  
  if (vert && vert !== 'cm') {
    // Use vertical-specific connection (but not for 'cm')
    client = await connectToMongoByVertical(vert);
  } else {
    // Use default connection (this will use mongodb/eventsquid secret when deployed)
    console.log(`Connecting to MongoDB using ${vert ? `vertical: ${vert}` : 'default connection'}`);
    client = await connectToMongo();
  }
  
  // Database name - typically the same for all verticals, but can be overridden
  // If dbName is 'cm', use 'cm', otherwise use the provided dbName or default
  const databaseName = dbName === 'cm' ? 'cm' : (dbName || process.env.MONGO_DB_NAME || 'eventsquid');
  
  // HARD FAIL: We should NEVER reach here with dbName === 'cm' because isCommonDb check above should have handled it
  // This is a safety check to prevent accidentally using mongodb/eventsquid to access 'cm'
  if (databaseName === 'cm') {
    console.error('[getDatabase] ERROR: Attempted to access "cm" database using default/vertical connection');
    console.error('[getDatabase] This should never happen - isCommonDb check should have caught this');
    throw new Error('Cannot access "cm" database using default/vertical connection. MUST use mongodb/common secret. This indicates a code path error.');
  }
  
  return client.db(databaseName);
}

/**
 * Close MongoDB connection (useful for cleanup)
 */
export async function closeMongoConnection() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
}

