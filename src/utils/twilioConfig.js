/**
 * Twilio credentials: environment variables and/or AWS Secrets Manager in Lambda.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { isDeployed } from './mongodb.js';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });

export const DEFAULT_TWILIO_SECRET_NAME = 'twilio/api-credentials';

let cached = null;
let inFlight = null;

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') {
      return obj[k];
    }
  }
  return undefined;
}

function parseSecretObject(secretString) {
  const trimmed = String(secretString).trim();
  if (!trimmed.startsWith('{')) {
    throw new Error('Twilio secret must be a JSON object');
  }
  return JSON.parse(trimmed);
}

function envOr(secretVal, fallback = null) {
  if (secretVal !== undefined && secretVal !== null && String(secretVal).trim() !== '') {
    return String(secretVal).trim();
  }
  return fallback;
}

/**
 * @param {Record<string, unknown>|null} secretObj
 */
function mergeTwilioConfig(secretObj) {
  const s = secretObj && typeof secretObj === 'object' ? secretObj : {};

  return {
    accountSid: envOr(
      process.env.TWILIO_ACCT_SID,
      envOr(pick(s, ['TWILIO_ACCT_SID', 'accountSid', 'account_sid']), null)
    ),
    authToken: envOr(
      process.env.TWILIO_AUTH_TOKEN,
      envOr(pick(s, ['TWILIO_AUTH_TOKEN', 'authToken', 'auth_token']), null)
    ),
    messagingServiceSid: envOr(
      process.env.TWILIO_MSG_SERVICE_SID,
      envOr(pick(s, ['TWILIO_MSG_SERVICE_SID', 'messagingServiceSid', 'messaging_service_sid']), null)
    ),
    statusCallback: envOr(
      process.env.TWILIO_STATUS_CALLBACK,
      envOr(pick(s, ['TWILIO_STATUS_CALLBACK', 'statusCallback']), 'twilio-status')
    ),
    /** Used for SendGrid webhook `_esk` when not stored on sendgrid secret */
    inboundApiKey: envOr(
      process.env.TWILIO_INBOUND_API_KEY || process.env.SENDGRID_INBOUND_API_KEY,
      envOr(pick(s, ['TWILIO_INBOUND_API_KEY', 'SENDGRID_INBOUND_API_KEY', 'inboundApiKey']), null)
    )
  };
}

/**
 * @returns {Promise<{ accountSid: string|null, authToken: string|null, messagingServiceSid: string|null, statusCallback: string, inboundApiKey: string|null }>}
 */
export async function getTwilioConfig() {
  if (!isDeployed()) {
    return mergeTwilioConfig(null);
  }

  if (cached) {
    return cached;
  }

  if (inFlight) {
    return inFlight;
  }

  const secretName = process.env.TWILIO_SECRET_NAME || DEFAULT_TWILIO_SECRET_NAME;

  inFlight = (async () => {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await secretsClient.send(command);
      const secretObj = parseSecretObject(response.SecretString);
      cached = mergeTwilioConfig(secretObj);
      return cached;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.warn(
          `Twilio secret "${secretName}" not found in Secrets Manager; using environment variables only`
        );
        cached = mergeTwilioConfig(null);
        return cached;
      }
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
