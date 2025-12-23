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
 * Get MongoDB connection string from Secrets Manager
 */
async function getMongoConnectionString() {
  const secretName = process.env.MONGO_SECRET_NAME || 'mongodb/eventsquid';

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);
    
    const secret = JSON.parse(response.SecretString);
    
    // Support different secret formats
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
  } catch (error) {
    console.error('Error retrieving MongoDB secret:', error);
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
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      mongoClient = new MongoClient(connectionString, options);
      await mongoClient.connect();
      
      console.log('Successfully connected to MongoDB');
      connectionPromise = null;
      return mongoClient;
    } catch (error) {
      connectionPromise = null;
      console.error('MongoDB connection error:', error);
      throw error;
    }
  })();

  return connectionPromise;
}

/**
 * Connect to MongoDB for a specific vertical
 * @param {string} vert - Vertical code (cm, cn, es, fd, ft, ir, kt, ln)
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

  // Get connection string for this vertical
  // Format: mongodb/eventsquid-{vert} or use environment variable
  const secretName = process.env[`MONGO_SECRET_NAME_${normalizedVert.toUpperCase()}`] || 
                    `mongodb/eventsquid-${normalizedVert}` ||
                    process.env.MONGO_SECRET_NAME || 
                    'mongodb/eventsquid';

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString);
    
    let connectionString;
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

    const options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const client = new MongoClient(connectionString, options);
    await client.connect();
    
    mongoClients[normalizedVert] = client;
    console.log(`Successfully connected to MongoDB for vertical: ${normalizedVert}`);
    return client;
  } catch (error) {
    console.error(`Error connecting to MongoDB for vertical ${normalizedVert}:`, error);
    // Fallback to default connection
    return await connectToMongo();
  }
}

/**
 * Get database instance
 * @param {string} dbName - Optional database name (defaults to eventsquid)
 * @param {string} vert - Optional vertical code (cm, cn, es, fd, ft, ir, kt, ln)
 * @returns {Promise<Database>}
 */
export async function getDatabase(dbName = null, vert = null) {
  let client;
  
  if (vert) {
    // Use vertical-specific connection
    client = await connectToMongoByVertical(vert);
  } else {
    // Use default connection
    client = await connectToMongo();
  }
  
  // Database name - typically the same for all verticals, but can be overridden
  const databaseName = dbName || process.env.MONGO_DB_NAME || 'eventsquid';
  
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

