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
let cmConnectionString = null;   // cached cm secret — fetched once per container
let cmConnectionPromise = null;  // deduplicates concurrent cm connection attempts

/**
 * Check if running in AWS Lambda (deployed) vs local development
 * @returns {boolean} True if deployed in AWS Lambda
 */
export function isDeployed() {
  // AWS Lambda sets AWS_LAMBDA_FUNCTION_NAME automatically
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

// Export mongoClients for services that need to check multiple databases
export function getMongoClient(key) {
  return mongoClients[key];
}

/**
 * Extract database name from MongoDB connection string
 * Handles patterns like: mongodb+srv://user:pass@cluster/dbname or mongodb://host:port/dbname
 */
function extractMongoDbName(connStr) {
  try {
    // Match database name after the last / but before ? (query params)
    const match = connStr.match(/\/([^/?]+)(?:\?|$)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Map vertical code → MongoDB database name. Same names MSSQL uses (per CLAUDE.md).
 * Used locally when a single MONGO_CONNECTION_STRING points at a multi-DB dev cluster
 * and we need to pick the right DB by vert. Production keeps using `'eventsquid'` since
 * each vert there has its own cluster with that DB name.
 */
const MONGO_DB_BY_VERTICAL = {
  cn: 'connect',
  es: 'eventsquid',
  fd: 'rcflightdeck',
  ft: 'fitsquid',
  ir: 'inreach',
  kt: 'kindertales',
  ln: 'launchsquid'
};

function getMongoDbNameByVert(vert) {
  if (!vert) return null;
  return MONGO_DB_BY_VERTICAL[String(vert).toLowerCase()] || null;
}

/**
 * Whether this Lambda container is serving the dev stage.
 * The dev API Gateway stage tracks $LATEST; the v1 stage tracks the `live` alias
 * (a numeric published version). AWS_LAMBDA_FUNCTION_VERSION is the per-container
 * signal that distinguishes them. Locally this is unset, so isDev is false and
 * the prod-shaped keys are used (local dev never reaches the secret-fetch paths).
 */
export function isDevStage() {
  return process.env.AWS_LAMBDA_FUNCTION_VERSION === '$LATEST';
}

/**
 * Pick the right MongoDB connection string from a parsed secret payload.
 * On the dev stage, requires `devConnectionString` and hard-fails if it is
 * missing — never silently falls back to the prod connection string.
 * @param {Object} secret - Parsed Secrets Manager JSON
 * @param {string} [fallbackDbName='eventsquid'] - DB name to embed when constructing from parts
 * @returns {string} MongoDB connection string
 */
function pickMongoConnectionString(secret, fallbackDbName = 'eventsquid') {
  const dev = isDevStage();
  let chosen;
  let chosenKey;

  if (dev) {
    if (!secret.devConnectionString) {
      throw new Error(
        'MongoDB secret missing "devConnectionString" — refusing to fall back to prod. ' +
        'Add a devConnectionString key to the secret for the dev stage.'
      );
    }
    chosen = secret.devConnectionString;
    chosenKey = 'devConnectionString';
  } else if (secret.connectionString) {
    chosen = secret.connectionString;
    chosenKey = 'connectionString';
  } else if (secret.uri) {
    chosen = secret.uri;
    chosenKey = 'uri';
  } else if (secret.mongodb_uri) {
    chosen = secret.mongodb_uri;
    chosenKey = 'mongodb_uri';
  } else {
    const { host, port, database, username, password } = secret;
    chosen = `mongodb://${username}:${password}@${host}:${port || 27017}/${database || fallbackDbName}?authSource=admin`;
    chosenKey = 'constructed-from-parts';
  }

  // Log which secret key was picked + sanitized host so CloudWatch confirms dev/prod selection.
  // Matches the format from local startup logging in mongodb.js / mssql.js.
  const hostMatch = chosen.match(/@([^/?]+)/);
  const host = hostMatch ? hostMatch[1] : 'unknown';
  const dbName = extractMongoDbName(chosen);
  console.log(`📚 MongoDB stage=${dev ? 'DEV' : 'PROD'} key=${chosenKey} host=${host} db=${dbName}`);

  return chosen;
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
      const dbNameFromStr = extractMongoDbName(process.env.MONGO_COMMON_CONNECTION_STRING);
      console.log(`\n📚 MongoDB: Using local env MONGO_COMMON_CONNECTION_STRING → ${dbNameFromStr}\n`);
      return process.env.MONGO_COMMON_CONNECTION_STRING;
    }

    // For local development, allow direct connection string override
    if (process.env.MONGO_CONNECTION_STRING) {
      const dbNameFromStr = extractMongoDbName(process.env.MONGO_CONNECTION_STRING);
      console.log(`\n📚 MongoDB: Using local env MONGO_CONNECTION_STRING → ${dbNameFromStr}\n`);
      return process.env.MONGO_CONNECTION_STRING;
    }
  }

  const secretName = process.env.MONGO_SECRET_NAME || 'mongodb/eventsquid';

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });

    // Add timeout wrapper for Secrets Manager call (15 seconds)
    const secretPromise = secretsClient.send(command);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Secrets Manager API call timeout after 15s for secret: ${secretName}`));
      }, 15000);
    });

    const response = await Promise.race([secretPromise, timeoutPromise]);

    // The secret may be a JSON object or a plain string (connection string)
    let secretValue = response.SecretString;

    // Try to parse as JSON first
    try {
      const secret = JSON.parse(secretValue);
      return pickMongoConnectionString(secret);
    } catch (parseError) {
      // If parsing fails, assume the secret is the connection string directly
      // This handles cases where the secret is stored as: mongodb+srv://...
      // Plain-string secrets can't carry a separate dev value — refuse on dev stage.
      if (isDevStage()) {
        throw new Error(
          'MongoDB secret is a plain connection string — cannot resolve a dev variant. ' +
          'Convert the secret to JSON with connectionString and devConnectionString keys.'
        );
      }
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
      const connectionString = await getMongoConnectionString();

      const options = {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: isDeployed() ? 8000 : (process.env.NODE_ENV === 'development' ? 10000 : 5000), // Reduced for deployed
        socketTimeoutMS: 20000, // Reduced to fail faster
        connectTimeoutMS: isDeployed() ? 10000 : (process.env.NODE_ENV === 'development' ? 10000 : 5000), // Reduced for deployed
      };

      mongoClient = new MongoClient(connectionString, options);

      // Add a timeout wrapper to ensure we don't hang forever (use 20s total to stay under Lambda timeout)
      const connectPromise = mongoClient.connect();
      const timeoutMs = 20000; // 20 seconds total timeout
      const connectTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`MongoDB connection timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      await Promise.race([connectPromise, connectTimeoutPromise]);

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
    const command = new GetSecretValueCommand({ SecretId: secretName });

    // Add timeout wrapper for Secrets Manager call (15 seconds)
    const secretPromise = secretsClient.send(command);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Secrets Manager API call timeout after 15s for secret: ${secretName}`));
      }, 15000);
    });

    const response = await Promise.race([secretPromise, timeoutPromise]);

    // The secret may be a JSON object or a plain string (connection string)
    let secretValue = response.SecretString;

    // Try to parse as JSON first
    let connectionString;
    try {
      const secret = JSON.parse(secretValue);
      connectionString = pickMongoConnectionString(secret);
    } catch (parseError) {
      // If parsing fails, assume the secret is the connection string directly
      // This handles cases where the secret is stored as: mongodb+srv://...
      // Plain-string secrets can't carry a separate dev value — refuse on dev stage.
      if (isDevStage()) {
        throw new Error(
          `MongoDB secret ${secretName} is a plain connection string — cannot resolve a dev variant. ` +
          'Convert the secret to JSON with connectionString and devConnectionString keys.'
        );
      }
      connectionString = secretValue;
    }

    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: isDeployed() ? 8000 : 5000, // Reduced for deployed
      socketTimeoutMS: 20000, // Reduced to fail faster
      connectTimeoutMS: isDeployed() ? 10000 : 5000, // Reduced for deployed
    };

    const client = new MongoClient(connectionString, options);

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
  
  if (isCommonDb) {
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
        return cmDb;
      } catch (cmError) {
        // Hard fail - no fallback to other databases
        console.error(`[getDatabase] Cannot access ${dbNameToUse} database. Connection string points to: ${dbNameFromConnection}`);
        throw new Error(`Cannot access ${dbNameToUse} database with provided connection string. Error: ${cmError.message}`);
      }
    } else {
      // When deployed, use Secrets Manager — but cache both the connection string and
      // the MongoClient so we only pay the Secrets Manager + TCP handshake cost once
      // per Lambda container (same pattern as twilioConfig.js / sendgridConfig.js).
      if (isDeployed()) {
        // Return cached client if healthy
        if (mongoClients['cm']) {
          try {
            await mongoClients['cm'].db().admin().ping();
            const dbMatch = (cmConnectionString || '').match(/\/([^/?]+)(\?|$)/);
            const dbNameToUse = dbMatch?.[1] || 'cm';
            return mongoClients['cm'].db(dbNameToUse);
          } catch {
            // Connection lost — clear and reconnect below
            delete mongoClients['cm'];
          }
        }

        // Deduplicate concurrent connection attempts (e.g. cold-start burst)
        if (cmConnectionPromise) {
          return cmConnectionPromise;
        }

        cmConnectionPromise = (async () => {
          const cmSecretName = process.env.MONGO_CM_SECRET_NAME || 'mongodb/common';
          try {
            // Only fetch the secret if we don't have it cached already
            if (!cmConnectionString) {
              const command = new GetSecretValueCommand({ SecretId: cmSecretName });
              const secretPromise = secretsClient.send(command);
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Secrets Manager timeout for ${cmSecretName}`)), 15000)
              );
              const response = await Promise.race([secretPromise, timeoutPromise]);

              let secretValue = response.SecretString;
              try {
                const secret = JSON.parse(secretValue);
                cmConnectionString = pickMongoConnectionString(secret, 'cm');
              } catch (parseError) {
                // pickMongoConnectionString throws on dev stage when devConnectionString is missing
                if (parseError.message?.includes('devConnectionString')) throw parseError;
                // Otherwise the secret is a plain connection string — refuse on dev stage
                if (isDevStage()) {
                  throw new Error(
                    `MongoDB secret ${cmSecretName} is a plain connection string — cannot resolve a dev variant. ` +
                    'Convert the secret to JSON with connectionString and devConnectionString keys.'
                  );
                }
                cmConnectionString = secretValue;
              }
            }

            const dbMatch = cmConnectionString.match(/\/([^/?]+)(\?|$)/);
            const dbNameToUse = dbMatch?.[1] || 'cm';

            const client = new MongoClient(cmConnectionString, {
              serverSelectionTimeoutMS: 30000,
              connectTimeoutMS: 30000,
              socketTimeoutMS: 30000,
            });
            await client.connect();
            mongoClients['cm'] = client;
            return client.db(dbNameToUse);
          } catch (cmError) {
            // Evict the cached connection string on auth/not-found errors so a
            // redeploy with a fixed secret will recover on the next request.
            if (cmError.name === 'ResourceNotFoundException' || cmError.name === 'AccessDeniedException') {
              cmConnectionString = null;
            }
            delete mongoClients['cm'];
            if (cmError.name === 'ResourceNotFoundException') {
              throw new Error(`MongoDB secret ${cmSecretName} not found in Secrets Manager.`);
            }
            if (cmError.name === 'AccessDeniedException') {
              throw new Error(`Access denied to MongoDB secret ${cmSecretName}. Check Lambda IAM role.`);
            }
            throw new Error(`Cannot access 'cm' database: ${cmError.message}`);
          } finally {
            cmConnectionPromise = null;
          }
        })();

        return cmConnectionPromise;
      } else {
        // Local dev without MONGO_COMMON_CONNECTION_STRING — hard fail
        console.error('MONGO_COMMON_CONNECTION_STRING not set. Cannot access "cm" database in local dev.');
        throw new Error('Cannot access "cm" database: set MONGO_COMMON_CONNECTION_STRING for local development');
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
    client = await connectToMongo();
  }
  
  // Database name resolution:
  //   1. Explicit dbName arg wins
  //   2. MONGO_DB_NAME env override
  //   3. Local dev (single dev cluster, multiple DBs): derive from vert (cn → connect, ft → fitsquid, ...)
  //   4. Deployed prod: each vert points at its own cluster with an `eventsquid` DB — keep that default
  const databaseName = dbName === 'cm'
    ? 'cm'
    : (dbName
       || process.env.MONGO_DB_NAME
       || (!isDeployed() && vert ? getMongoDbNameByVert(vert) : null)
       || 'eventsquid');
  
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

