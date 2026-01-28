/**
 * SNS utility for error notifications
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-west-2' });
const ERROR_SNS_TOPIC_ARN = process.env.ERROR_SNS_TOPIC_ARN;

/**
 * Publish error to SNS topic if configured
 * @param {Error} error - The error object
 * @param {Object} context - Additional context (requestId, path, method, etc.)
 */
export async function publishErrorToSNS(error, context = {}) {
  if (!ERROR_SNS_TOPIC_ARN) {
    // Log that SNS is not configured
    console.log('⚠️  SNS error notifications not configured (ERROR_SNS_TOPIC_ARN not set)');
    console.log('   To enable SNS notifications, set ERROR_SNS_TOPIC_ARN environment variable');
    return; // SNS topic not configured, skip
  }

  try {
    const errorMessage = {
      subject: `EventSquid API Error - ${process.env.NODE_ENV || 'unknown'}`,
      message: JSON.stringify({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        context: {
          requestId: context.requestId || 'unknown',
          path: context.path || 'unknown',
          method: context.method || 'unknown',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'unknown'
        }
      }, null, 2)
    };

    await snsClient.send(new PublishCommand({
      TopicArn: ERROR_SNS_TOPIC_ARN,
      Subject: errorMessage.subject,
      Message: errorMessage.message
    }));
    
    console.log('✅ Error published to SNS topic');
  } catch (snsError) {
    // Don't fail the request if SNS publish fails, just log it
    console.error('❌ Failed to publish error to SNS:', snsError);
  }
}
