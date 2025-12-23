# EventSquid API - Lambda Migration

This repository contains the migrated EventSquid API from Mantle to AWS Lambda with API Gateway, designed for private VPC access.

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

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI Profile**: Configure the `eventsquid` profile (`aws configure --profile eventsquid`)
3. **VPC Configuration**: VPC ID and Subnet IDs where Lambda will run
4. **Secrets Manager**: MongoDB connection string stored as a secret
5. **GitHub Secrets** configured (for automated deployments):
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `VPC_ID`
   - `SUBNET_IDS` (comma-separated list)
   - `MONGO_SECRET_NAME`
   - `MONGO_DB_NAME`

## Setup

### 1. Initial CloudFormation Deployment

Before automated deployments, you need to create the initial stack:

```bash
aws cloudformation create-stack \
  --stack-name dev-eventsquid-api \
  --template-body file://cloudformation/template.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=VpcId,ParameterValue=vpc-xxxxx \
    ParameterKey=SubnetIds,ParameterValue=subnet-xxxxx,subnet-yyyyy \
    ParameterKey=MongoSecretName,ParameterValue=mongodb/eventsquid \
    ParameterKey=MongoDbName,ParameterValue=eventsquid \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-west-2 \
  --profile eventsquid
```

### 2. Configure GitHub Secrets

In your GitHub repository, go to Settings → Secrets and variables → Actions, and add:

- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `VPC_ID`: Your VPC ID
- `SUBNET_IDS`: Comma-separated subnet IDs (e.g., `subnet-123,subnet-456`)
- `MONGO_SECRET_NAME`: Name of your MongoDB secret in Secrets Manager
- `MONGO_DB_NAME`: MongoDB database name

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

### Automated Deployment (GitHub Actions)

Deployments happen automatically on:
- Push to `main` branch → deploys to `prod`
- Push to `develop` branch → deploys to `staging`
- Manual workflow dispatch → choose environment

### Manual Deployment

1. Package the function:
```bash
npm install --production
zip -r function.zip . -x '*.git*' -x '*.zip' -x 'node_modules/.cache/*'
```

2. Update Lambda function:
```bash
aws lambda update-function-code \
  --function-name dev-eventsquid-api \
  --zip-file fileb://function.zip \
  --profile eventsquid
```

3. Update CloudFormation stack:
```bash
aws cloudformation deploy \
  --template-file cloudformation/template.yaml \
  --stack-name dev-eventsquid-api \
  --parameter-overrides \
    Environment=dev \
    VpcId=vpc-xxxxx \
    SubnetIds=subnet-xxxxx,subnet-yyyyy \
    MongoSecretName=mongodb/eventsquid \
    MongoDbName=eventsquid \
  --capabilities CAPABILITY_NAMED_IAM \
  --profile eventsquid
```

## Migration Checklist

- [ ] Review existing Mantle application codebase
- [ ] Identify all routes and endpoints
- [ ] Map routes to Lambda handlers
- [ ] Update MongoDB connection logic
- [ ] Test MongoDB connection from Lambda
- [ ] Migrate business logic
- [ ] Update environment variables
- [ ] Test API Gateway integration
- [ ] Configure VPC endpoints for private access
- [ ] Set up monitoring and logging
- [ ] Update documentation

## Monitoring

- **CloudWatch Logs**: `/aws/lambda/{environment}-eventsquid-api`
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
- Verify all GitHub secrets are set
- Check AWS credentials have necessary permissions
- Verify VPC and subnet IDs are correct

## Support

For issues or questions, please open an issue in this repository.

