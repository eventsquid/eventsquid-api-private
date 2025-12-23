#!/bin/bash
# Deployment script for manual Lambda function updates
# Usage: ./scripts/deploy.sh [environment] [aws-profile]

set -e

ENVIRONMENT=${1:-dev}
AWS_PROFILE=${2:-eventsquid}
AWS_REGION=${AWS_REGION:-us-west-2}
FUNCTION_NAME="${ENVIRONMENT}-eventsquid-api"

echo "🚀 Deploying to ${ENVIRONMENT} environment..."
echo "Function: ${FUNCTION_NAME}"
echo "Region: ${AWS_REGION}"

# Install production dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Package the function
echo "📦 Packaging Lambda function..."
zip -r function.zip . \
  -x '*.git*' \
  -x '*.zip' \
  -x 'node_modules/.cache/*' \
  -x '*.md' \
  -x '.github/*' \
  -x 'cloudformation/*' \
  -x '*.test.js' \
  -x '.eslintrc*' \
  -x 'scripts/*'

# Update Lambda function code
echo "⬆️  Uploading function code..."
aws lambda update-function-code \
  --function-name "${FUNCTION_NAME}" \
  --zip-file fileb://function.zip \
  --region "${AWS_REGION}" \
  --profile "${AWS_PROFILE}"

# Wait for update to complete
echo "⏳ Waiting for update to complete..."
aws lambda wait function-updated \
  --function-name "${FUNCTION_NAME}" \
  --region "${AWS_REGION}" \
  --profile "${AWS_PROFILE}"

# Cleanup
rm -f function.zip

echo "✅ Deployment complete!"
echo "Function: ${FUNCTION_NAME}"
echo "Region: ${AWS_REGION}"

