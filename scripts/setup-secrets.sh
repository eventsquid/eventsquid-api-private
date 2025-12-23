#!/bin/bash
# Helper script to set up MongoDB secret in AWS Secrets Manager
# Usage: ./scripts/setup-secrets.sh [secret-name] [connection-string] [aws-profile]

set -e

SECRET_NAME=${1:-mongodb/eventsquid}
CONNECTION_STRING=${2}
AWS_PROFILE=${3:-eventsquid}

if [ -z "$CONNECTION_STRING" ]; then
  echo "Usage: $0 [secret-name] [connection-string] [aws-profile]"
  echo "Example: $0 mongodb/eventsquid 'mongodb://user:pass@host:27017/db' eventsquid"
  exit 1
fi

AWS_REGION=${AWS_REGION:-us-west-2}

echo "🔐 Creating/updating secret: ${SECRET_NAME}"

# Create secret JSON
SECRET_JSON=$(cat <<EOF
{
  "connectionString": "${CONNECTION_STRING}"
}
EOF
)

# Create or update secret
aws secretsmanager put-secret-value \
  --secret-id "${SECRET_NAME}" \
  --secret-string "${SECRET_JSON}" \
  --region "${AWS_REGION}" \
  --profile "${AWS_PROFILE}" \
  2>/dev/null || \
aws secretsmanager create-secret \
  --name "${SECRET_NAME}" \
  --secret-string "${SECRET_JSON}" \
  --region "${AWS_REGION}" \
  --profile "${AWS_PROFILE}"

echo "✅ Secret created/updated successfully!"

