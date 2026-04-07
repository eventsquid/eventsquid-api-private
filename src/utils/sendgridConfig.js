/**
 * SendGrid settings: environment variables and/or AWS Secrets Manager in Lambda.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { isDeployed } from './mongodb.js';
import { getTwilioConfig } from './twilioConfig.js';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-west-2' });

export const DEFAULT_SENDGRID_SECRET_NAME = 'sendgrid/api-credentials';

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
    throw new Error('SendGrid secret must be a JSON object');
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
 * Merge env (highest priority) with optional Secrets Manager payload.
 * @param {Record<string, unknown>|null} secretObj
 */
function mergeSendGridConfig(secretObj) {
  const s = secretObj && typeof secretObj === 'object' ? secretObj : {};

  const apiKeyFromEnv = process.env.SG_API_KEY || process.env.SENDGRID_API_KEY;
  const apiKeyFromSecret = pick(s, [
    'apiKey',
    'api_key',
    'SG_API_KEY',
    'SENDGRID_API_KEY',
    'sendgridApiKey'
  ]);

  const inboundFromEnv = process.env.TWILIO_INBOUND_API_KEY || process.env.SENDGRID_INBOUND_API_KEY;
  const inboundFromSecret = pick(s, [
    'inboundApiKey',
    'SENDGRID_INBOUND_API_KEY',
    'TWILIO_INBOUND_API_KEY',
    'twilioInboundApiKey'
  ]);

  return {
    apiKey: envOr(apiKeyFromEnv, envOr(apiKeyFromSecret, null)),
    sender: envOr(
      process.env.SENDGRID_SENDER,
      envOr(pick(s, ['sender', 'SENDGRID_SENDER']), 'noreply@eventsquid.com')
    ),
    inboundApiKey: envOr(inboundFromEnv, envOr(inboundFromSecret, null)),
    emailValidationKey: envOr(
      process.env.SG_EMAIL_VAL_KEY,
      envOr(
        pick(s, ['emailValidationKey', 'SG_EMAIL_VAL_KEY', 'emailValKey', 'sgEmailValKey']),
        null
      )
    ),
    emailActivityKey: envOr(
      process.env.SG_EMAIL_ACTIVITY_KEY,
      envOr(pick(s, ['emailActivityKey', 'SG_EMAIL_ACTIVITY_KEY', 'sgEmailActivityKey']), null)
    )
  };
}

/**
 * Inbound / `_esk` key may live on `twilio/api-credentials` only; merge it in for SendGrid paths.
 * @param {object} merged
 */
async function supplementInboundFromTwilioSecret(merged) {
  if (merged.inboundApiKey) {
    return merged;
  }
  try {
    const tw = await getTwilioConfig();
    if (tw.inboundApiKey) {
      return { ...merged, inboundApiKey: tw.inboundApiKey };
    }
  } catch (e) {
    console.warn('SendGrid inbound key: could not load Twilio secret fallback:', e.message);
  }
  return merged;
}

/**
 * @returns {Promise<{ apiKey: string|null, sender: string, inboundApiKey: string|null, emailValidationKey: string|null, emailActivityKey: string|null }>}
 */
export async function getSendGridConfig() {
  if (!isDeployed()) {
    return mergeSendGridConfig(null);
  }

  if (cached) {
    return cached;
  }

  if (inFlight) {
    return inFlight;
  }

  const secretName = process.env.SENDGRID_SECRET_NAME || DEFAULT_SENDGRID_SECRET_NAME;

  inFlight = (async () => {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await secretsClient.send(command);
      const secretObj = parseSecretObject(response.SecretString);
      let merged = mergeSendGridConfig(secretObj);
      merged = await supplementInboundFromTwilioSecret(merged);
      cached = merged;
      return cached;
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.warn(
          `SendGrid secret "${secretName}" not found in Secrets Manager; using environment variables only`
        );
        let merged = mergeSendGridConfig(null);
        merged = await supplementInboundFromTwilioSecret(merged);
        cached = merged;
        return cached;
      }
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
