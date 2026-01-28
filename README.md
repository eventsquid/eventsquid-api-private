# EventSquid API - Lambda Migration

This repository contains the migrated EventSquid API from Mantle to AWS Lambda with API Gateway, designed for private VPC access.

## ✅ Migration Status: COMPLETE

**All 247 routes have been migrated and are fully functional.** All core services and functions are implemented. See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for detailed status.


## Architecture

- **Runtime**: Node.js 24
- **Compute**: AWS Lambda
- **API**: API Gateway (HTTP API)
- **Database**: MongoDB (connection via Secrets Manager)
- **Network**: VPC-based deployment for private access
- **Deployment**: CloudFormation + GitHub Actions

## Project Structure

```
.
├── src/
│   ├── handler.js          # Main Lambda handler
│   ├── routes/
│   │   └── index.js        # Route definitions
│   └── utils/
│       ├── mongodb.js      # MongoDB connection utility
│       └── response.js     # API response helpers
├── cloudformation/
│   └── template.yaml       # CloudFormation infrastructure template
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions deployment workflow
├── package.json
└── README.md
```

## Features

- ✅ **247 API Routes** - All routes migrated from Mantle
- ✅ **33 Controllers** - All controllers fully implemented
- ✅ **20+ Services** - Core business logic services
- ✅ **15+ Function Modules** - Reusable utility functions
- ✅ **MongoDB Integration** - Full MongoDB support with verticals
- ✅ **MSSQL Integration** - Full MSSQL support with stored procedures
- ✅ **S3 Integration** - File upload/download/management
- ✅ **SendGrid Integration** - Email sending and validation
- ✅ **Payment Gateways** - Stripe, AuthNet, PayPal, PayZang, Vantiv/Worldpay
- ✅ **Authentication** - Session-based auth with MongoDB
- ✅ **Multi-Vertical Support** - Supports multiple database verticals

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI Profile**: Configure the `eventsquid` profile (`aws configure --profile eventsquid`)
3. **VPC Configuration**: VPC ID and Subnet IDs where Lambda will run
4. **Secrets Manager**: 
   - MongoDB connection string stored as a secret
   - MSSQL connection string stored as a secret (primary-mssql/event-squid)
5. **AWS Secrets Manager** configured:
   - MongoDB connection string stored as a secret
   - MSSQL connection string stored as a secret (primary-mssql/event-squid)
   - All secrets are managed in AWS Secrets Manager - no GitHub secrets needed

## Setup

### 1. Initial CloudFormation Deployment

Before automated deployments, you need to create the initial stack:

**Bash/Linux/Mac:**
```bash
aws cloudformation create-stack \
  --stack-name eventsquid-private-api \
  --template-body file://cloudformation/template.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=VpcId,ParameterValue=vpc-38dc235f \
    ParameterKey=SubnetIds,ParameterValue=subnet-3c625f4a,subnet-3a650c62,subnet-0a504b6e \
    ParameterKey=MongoSecretName,ParameterValue=mongodb/eventsquid \
    ParameterKey=MongoDbName,ParameterValue=eventsquid \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-west-2 \
  --profile eventsquid
```

**PowerShell (Windows):**
```powershell
aws cloudformation create-stack `
  --stack-name eventsquid-private-api `
  --template-body file://cloudformation/template.yaml `
  --parameters ParameterKey=Environment,ParameterValue=dev ParameterKey=VpcId,ParameterValue=vpc-38dc235f "ParameterKey=SubnetIds,ParameterValue='subnet-3c625f4a,subnet-3a650c62,subnet-0a504b6e'" ParameterKey=MongoSecretName,ParameterValue=mongodb/eventsquid ParameterKey=MongoDbName,ParameterValue=eventsquid `
  --capabilities CAPABILITY_NAMED_IAM `
  --region us-west-2 `
  --profile eventsquid
```

**Note:** In PowerShell, use backticks (`) for line continuation, not backslashes (\). Also, quote the SubnetIds parameter value to prevent PowerShell from splitting on commas.

### 2. Configure AWS Secrets Manager

All secrets are stored in AWS Secrets Manager. No GitHub secrets are needed since deployment is handled by AWS CodePipeline.

Ensure the following secrets exist in AWS Secrets Manager:
- MongoDB connection string (referenced by `MongoSecretName` parameter)
- MSSQL connection string (if needed)

The CodePipeline uses IAM roles with appropriate permissions to access these secrets during deployment.

### 3. MongoDB Secret Format

Store your MongoDB connection string in AWS Secrets Manager. The secret can be in one of these formats:

**Option 1: Connection string**
```json
{
  "connectionString": "mongodb://user:password@host:27017/database?authSource=admin"
}
```

**Option 2: Individual components**
```json
{
  "host": "mongodb.example.com",
  "port": 27017,
  "database": "eventsquid",
  "username": "user",
  "password": "password"
}
```

## Development

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
export MONGO_SECRET_NAME=mongodb/eventsquid
export MONGO_DB_NAME=eventsquid
export AWS_REGION=us-west-2
export NODE_ENV=development
```

3. For local testing, you may want to use a local MongoDB or configure AWS credentials to access Secrets Manager.

### Adding Routes

Edit `src/routes/index.js` to add new routes:

```javascript
const myRoute = {
  method: 'GET',
  path: '/api/my-endpoint',
  handler: async (request) => {
    // Your route logic here
    const db = await getDatabase();
    // ... use database
    return { data: 'result' };
  }
};

export const routes = [
  healthCheck,
  myRoute,
  // ... other routes
];
```

### Testing with Postman

1. Get your API Gateway URL from CloudFormation outputs or AWS Console
2. Configure Postman to use the API Gateway endpoint
3. For private APIs, you may need to:
   - Use a VPC endpoint
   - Configure API Gateway resource policy for specific IPs
   - Use AWS credentials for authentication

## Deployment

### Automated Deployment (AWS CodePipeline)

This project uses AWS CodePipeline for CI/CD, similar to other EventSquid projects.

#### Initial Pipeline Setup

1. **Create GitHub Connection** (if not already exists):
   - Go to AWS Console → Developer Tools → Settings → Connections
   - Click "Create connection"
   - Select "GitHub" as the provider
   - Give it a name (e.g., "GitHub-All-Repos")
   - Click "Connect to GitHub"
   - You'll be redirected to GitHub to authorize the connection
   - **Important**: When authorizing, make sure to grant access to:
     - All repositories (recommended), OR
     - The specific organization/repositories you need
   - After authorization, return to AWS Console
   - Wait for the connection status to show "Available" (may take a minute)
   - Copy the Connection ARN (format: `arn:aws:codestar-connections:REGION:ACCOUNT:connection/CONNECTION_ID`)

2. **Deploy the Pipeline Stack**:
```bash
aws cloudformation create-stack \
  --stack-name eventsquid-api-pipeline \
  --template-body file://cloudformation/pipeline.yaml \
  --parameters \
    ParameterKey=GitHubOwner,ParameterValue=YOUR_GITHUB_OWNER \
    ParameterKey=GitHubRepo,ParameterValue=eventsquid-api-private \
    ParameterKey=GitHubBranch,ParameterValue=main \
    ParameterKey=GitHubConnectionArn,ParameterValue=arn:aws:codestar-connections:us-west-2:326684255434:connection/0b67c1a2-20c4-40f6-998e-2acb9bce9059 \
    ParameterKey=VpcId,ParameterValue=vpc-xxxxx \
    ParameterKey=SubnetIds,ParameterValue=subnet-xxxxx,subnet-yyyyy \
    ParameterKey=MongoSecretName,ParameterValue=mongodb/eventsquid \
    ParameterKey=MongoDbName,ParameterValue=eventsquid \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-west-2 \
  --profile eventsquid
```

3. **Pipeline Behavior**:
   - Push to `main` branch → deploys to `prod` environment
   - Push to `develop` branch → deploys to `staging` environment
   - Push to other branches → deploys to `dev` environment

The pipeline will automatically:
- Build the Lambda function package
- Deploy CloudFormation stack
- Update Lambda function code
- Update Lambda function configuration

#### Multiple Pipeline Setups

You can create separate pipelines for different branches:

```bash
# Pipeline for main branch (prod)
aws cloudformation create-stack \
  --stack-name eventsquid-api-pipeline-prod \
  --template-body file://cloudformation/pipeline.yaml \
  --parameters \
    ParameterKey=GitHubBranch,ParameterValue=main \
    ...

# Pipeline for develop branch (staging)
aws cloudformation create-stack \
  --stack-name eventsquid-api-pipeline-staging \
  --template-body file://cloudformation/pipeline.yaml \
  --parameters \
    ParameterKey=GitHubBranch,ParameterValue=develop \
    ...
```

### Manual Deployment

1. Package the function:
```bash
npm install --production
zip -r function.zip . -x '*.git*' -x '*.zip' -x 'node_modules/.cache/*'
```

2. Update Lambda function:
```bash
aws lambda update-function-code \
  --function-name eventsquid-private-api \
  --zip-file fileb://function.zip \
  --profile eventsquid
```

3. Update CloudFormation stack:
```bash
aws cloudformation deploy \
  --template-file cloudformation/template.yaml \
  --stack-name eventsquid-private-api \
  --parameter-overrides \
    Environment=dev \
    VpcId=vpc-xxxxx \
    SubnetIds=subnet-xxxxx,subnet-yyyyy \
    MongoSecretName=mongodb/eventsquid \
    MongoDbName=eventsquid \
  --capabilities CAPABILITY_NAMED_IAM \
  --profile eventsquid
```

### Legacy: GitHub Actions (Deprecated)

The project previously used GitHub Actions for deployment. This has been replaced with AWS CodePipeline for consistency with other EventSquid projects. The GitHub Actions workflow file (`.github/workflows/deploy.yml`) is kept for reference but is no longer used.

**Important:** If you have an existing CloudFormation stack created by GitHub Actions, see [PIPELINE_MIGRATION.md](./docs/PIPELINE_MIGRATION.md) for migration guidance.

## Migration Checklist

- [x] Review existing Mantle application codebase
- [x] Identify all routes and endpoints
- [x] Map routes to Lambda handlers
- [x] Update MongoDB connection logic
- [x] Update MSSQL connection logic
- [x] Migrate business logic (20+ services)
- [x] Migrate utility functions (15+ function modules)
- [x] Update environment variables
- [x] Test API Gateway integration
- [x] Configure VPC endpoints for private access
- [x] Set up monitoring and logging
- [x] Update documentation
- [x] **MIGRATION COMPLETE** - All 247 routes and core services implemented

See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for detailed migration status.

## Monitoring

- **CloudWatch Logs**: `/aws/lambda/eventsquid-private-api`
- **API Gateway Metrics**: Available in CloudWatch
- **Lambda Metrics**: Invocations, errors, duration, throttles

## Security Considerations

1. **VPC Configuration**: Lambda runs in private subnets
2. **Secrets Management**: MongoDB credentials stored in Secrets Manager
3. **IAM Roles**: Least privilege principle applied
4. **API Gateway**: Configure resource policies for access control
5. **Network Security**: Security groups restrict outbound traffic

## Troubleshooting

### Lambda can't connect to MongoDB
- Verify VPC configuration and security groups
- Check that MongoDB is accessible from Lambda subnets
- Verify Secrets Manager permissions
- Check CloudWatch logs for connection errors

### API Gateway returns 502
- Check Lambda function logs
- Verify Lambda function is deployed correctly
- Check API Gateway integration configuration

### Deployment fails

#### Error: "Credentials could not be loaded" or GitHub Actions deployment failures

**This project uses AWS CodePipeline for deployment, not GitHub Actions.**

If you're seeing GitHub Actions errors:

1. **The GitHub Actions workflow has been removed** - This project uses AWS CodePipeline which handles all deployment automatically
2. **No GitHub secrets are needed** - CodePipeline uses IAM roles with appropriate permissions
3. **Deployment is triggered automatically** when you push to the configured branch (main/develop)

**If deployment is failing, check:**
- AWS CodePipeline status in the AWS Console
- CodeBuild logs for build errors
- Ensure the CodeStar Connection is properly configured and authorized
- Verify the pipeline stack is deployed and active

#### Other deployment issues:
- Check CodePipeline status in AWS Console
- Review CodeBuild logs for specific error messages
- Verify the CodeStar Connection is authorized and active
- Ensure the pipeline CloudFormation stack is deployed
- Verify VPC and subnet IDs are correct in the pipeline parameters

## Support

For issues or questions, please open an issue in this repository.

