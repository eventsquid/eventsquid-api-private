# Quick Start Guide

Get up and running with the EventSquid API Lambda migration in minutes.

## Prerequisites Check

- [ ] AWS CLI installed and configured
- [ ] AWS profile `eventsquid` configured (`aws configure --profile eventsquid`)
- [ ] Node.js 24+ installed
- [ ] Access to AWS account with appropriate permissions
- [ ] VPC ID and Subnet IDs available
- [ ] MongoDB connection string ready

## Step 1: Clone and Setup

```bash
git clone <this-repo>
cd eventsquid-api-private
npm install
```

**Note**: All AWS CLI commands in this guide use the `eventsquid` profile. Make sure you have configured this profile:
```bash
aws configure --profile eventsquid
```

## Step 2: Configure MongoDB Secret

Store your MongoDB connection string in AWS Secrets Manager:

```bash
# Option 1: Using the helper script
chmod +x scripts/setup-secrets.sh
./scripts/setup-secrets.sh mongodb/eventsquid "mongodb://user:pass@host:27017/database"

# Option 2: Using AWS CLI directly
aws secretsmanager create-secret \
  --name mongodb/eventsquid \
  --secret-string '{"connectionString":"mongodb://user:pass@host:27017/database"}' \
  --region us-west-2 \
  --profile eventsquid
```

## Step 3: Initial CloudFormation Deployment

Deploy the infrastructure:

```bash
aws cloudformation create-stack 
  --stack-name dev-eventsquid-api
  --template-body file://cloudformation/template.yaml
  --parameters \
    ParameterKey=Environment,ParameterValue=dev
    ParameterKey=VpcId,ParameterValue=vpc-38dc235f
    ParameterKey=SubnetIds,ParameterValue=subnet-3c625f4a
    ParameterKey=MongoSecretName,ParameterValue=mongodb/eventsquid 
    ParameterKey=MongoDbName,ParameterValue=eventsquid 
  --capabilities CAPABILITY_NAMED_IAM 
  --region us-west-2 
  --profile eventsquid
```

Wait for stack creation (5-10 minutes):

```bash
aws cloudformation wait stack-create-complete \
  --stack-name dev-eventsquid-api \
  --region us-west-2 \
  --profile eventsquid
```

## Step 4: Deploy Lambda Function Code

After CloudFormation completes, deploy the actual function code:

```bash
# Option 1: Using the deployment script
# On Windows (PowerShell):
.\scripts\deploy.ps1 dev

# On Linux/Mac (Bash):
chmod +x scripts/deploy.sh
./scripts/deploy.sh dev

# Option 2: Manual deployment
npm install --production
zip -r function.zip . -x '*.git*' -x '*.zip' -x 'node_modules/.cache/*' -x '*.md' -x '.github/*' -x 'cloudformation/*'
aws lambda update-function-code \
  --function-name dev-eventsquid-api \
  --zip-file fileb://function.zip \
  --region us-west-2 \
  --profile eventsquid
rm function.zip
```

## Step 5: Get API Gateway URL

```bash
aws cloudformation describe-stacks \
  --stack-name dev-eventsquid-api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text \
  --region us-west-2 \
  --profile eventsquid
```

## Step 6: Test the API

### Health Check

```bash
curl https://<api-gateway-url>/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-XX...",
  "service": "eventsquid-api"
}
```

### Using Postman

1. Create a new request
2. Set method to `GET`
3. Enter URL: `https://<api-gateway-url>/health`
4. Send request

**Note**: For private VPC APIs, you may need to:
- Configure API Gateway resource policy
- Use VPC endpoint
- Access from within the VPC

## Step 7: Configure GitHub Actions (Optional)

For automated deployments:

1. Go to GitHub repository → Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `VPC_ID`
   - `SUBNET_IDS` (comma-separated)
   - `MONGO_SECRET_NAME`
   - `MONGO_DB_NAME`

3. Push to `main` or `develop` branch to trigger deployment

## Next Steps

1. **Review the migration guide**: See `MIGRATION_GUIDE.md` for detailed migration steps
2. **Migrate your routes**: Start migrating routes from your Mantle application
3. **Test thoroughly**: Test each endpoint after migration
4. **Set up monitoring**: Configure CloudWatch alarms
5. **Update documentation**: Document your API endpoints

## Troubleshooting

### Lambda can't connect to MongoDB
- Verify VPC configuration
- Check security groups allow outbound traffic
- Verify Secrets Manager permissions
- Check CloudWatch logs: `/aws/lambda/dev-eventsquid-api`

### API Gateway returns 502
- Check Lambda function logs
- Verify function is deployed correctly
- Check API Gateway integration

### Deployment fails
- Verify AWS credentials
- Check IAM permissions
- Verify VPC/subnet IDs are correct

## Useful Commands

```bash
# View Lambda logs
aws logs tail /aws/lambda/dev-eventsquid-api --follow --region us-west-2 --profile eventsquid

# Test Lambda function directly
aws lambda invoke \
  --function-name dev-eventsquid-api \
  --payload '{"requestContext":{"http":{"method":"GET","path":"/health"}}}' \
  response.json \
  --region us-west-2 \
  --profile eventsquid
cat response.json

# Update environment variables
aws lambda update-function-configuration \
  --function-name dev-eventsquid-api \
  --environment Variables="{NODE_ENV=dev,MONGO_SECRET_NAME=mongodb/eventsquid}" \
  --region us-west-2 \
  --profile eventsquid

# Delete stack (cleanup)
aws cloudformation delete-stack --stack-name dev-eventsquid-api --region us-west-2 --profile eventsquid
```

## Support

For detailed migration instructions, see `MIGRATION_GUIDE.md`.
For architecture details, see `README.md`.

