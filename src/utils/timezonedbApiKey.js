/**
 * TimeZoneDB API key: env override, or AWS Secrets Manager when running in Lambda.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { isDeployed } from './mongodb.js';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });

/** Default secret id (create in Secrets Manager under this name or set TIMEZONEDB_SECRET_NAME). */
export const DEFAULT_TIMEZONEDB_SECRET_NAME = 'timezonedb/api-key';

let cachedKey = null;
let inFlight = null;

function parseSecretString(secretString) {
  const trimmed = String(secretString).trim();
  if (trimmed.startsWith('{')) {
    const o = JSON.parse(trimmed);
    return (
      o.apiKey ||
      o.key ||
      o.api_key ||
      o.TIMEZONEDB_API_KEY ||
      ''
    );
  }
  return trimmed;
}

/**
 * @returns {Promise<string|null>} API key, or null when not deployed and no env key (local skip).
 */
export async function getTimeZoneDbApiKey() {
  if (process.env.TIMEZONEDB_API_KEY) {
    return process.env.TIMEZONEDB_API_KEY;
  }

  if (!isDeployed()) {
    return null;
  }

  if (cachedKey) {
    return cachedKey;
  }

  if (inFlight) {
    return inFlight;
  }

  const secretName = process.env.TIMEZONEDB_SECRET_NAME || DEFAULT_TIMEZONEDB_SECRET_NAME;

  inFlight = (async () => {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await secretsClient.send(command);
      const key = parseSecretString(response.SecretString);
      if (!key) {
        throw new Error(
          `Secret "${secretName}" must be a plain API key string or JSON with apiKey, key, or api_key`
        );
      }
      cachedKey = key;
      return key;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
