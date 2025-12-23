# Project Structure

This document describes the project structure and purpose of each file/directory.

## Directory Structure

```
eventsquid-api-private/
├── src/                          # Source code
│   ├── handler.js                # Main Lambda handler (entry point)
│   ├── routes/                   # Route definitions
│   │   ├── index.js             # Route registry (exports all routes)
│   │   └── example-mongo.js     # Example routes showing MongoDB usage
│   └── utils/                    # Utility functions
│       ├── mongodb.js            # MongoDB connection utility (Secrets Manager)
│       └── response.js          # API response helpers
│
├── cloudformation/               # Infrastructure as Code
│   └── template.yaml            # CloudFormation template (API Gateway, Lambda, VPC, IAM)
│
├── .github/                      # GitHub configuration
│   └── workflows/
│       └── deploy.yml           # GitHub Actions CI/CD workflow
│
├── scripts/                      # Deployment and utility scripts
│   ├── deploy.sh                # Manual Lambda deployment script
│   └── setup-secrets.sh         # Helper to create Secrets Manager secrets
│
├── package.json                  # Node.js dependencies and scripts
├── .eslintrc.json               # ESLint configuration
├── .gitignore                   # Git ignore patterns
│
├── README.md                     # Main documentation
├── QUICKSTART.md                 # Quick start guide
├── MIGRATION_GUIDE.md           # Detailed migration guide from Mantle
└── PROJECT_STRUCTURE.md          # This file
```

## File Descriptions

### Source Code (`src/`)

#### `src/handler.js`
- **Purpose**: Main Lambda function entry point
- **Responsibilities**:
  - Parse API Gateway events
  - Route requests to appropriate handlers
  - Handle CORS preflight requests
  - Extract path parameters
  - Error handling and response formatting

#### `src/routes/index.js`
- **Purpose**: Central route registry
- **Responsibilities**:
  - Import and export all route definitions
  - Add new routes here as you migrate

#### `src/routes/example-mongo.js`
- **Purpose**: Example routes demonstrating MongoDB usage
- **Contains**:
  - GET `/api/items` - List items
  - GET `/api/items/:id` - Get single item
  - POST `/api/items` - Create item
- **Note**: Remove these when you add your actual routes

#### `src/utils/mongodb.js`
- **Purpose**: MongoDB connection management
- **Features**:
  - Retrieves connection string from AWS Secrets Manager
  - Connection pooling
  - Automatic reconnection
  - Supports multiple secret formats

#### `src/utils/response.js`
- **Purpose**: Standardized API response formatting
- **Functions**:
  - `createResponse()` - Generic response creator
  - `successResponse()` - Success response helper
  - `errorResponse()` - Error response helper

### Infrastructure (`cloudformation/`)

#### `cloudformation/template.yaml`
- **Purpose**: AWS infrastructure definition
- **Resources Created**:
  - Lambda function (Node.js 24)
  - API Gateway (HTTP API)
  - IAM roles and policies
  - Security groups
  - CloudWatch log groups
  - VPC configuration

### CI/CD (`.github/workflows/`)

#### `.github/workflows/deploy.yml`
- **Purpose**: Automated deployment pipeline
- **Triggers**:
  - Push to `main` → deploys to `prod`
  - Push to `develop` → deploys to `staging`
  - Manual workflow dispatch
- **Steps**:
  - Install dependencies
  - Run tests
  - Package Lambda function
  - Deploy to AWS
  - Update CloudFormation stack

### Scripts (`scripts/`)

#### `scripts/deploy.sh`
- **Purpose**: Manual Lambda function deployment
- **Usage**: `./scripts/deploy.sh [environment]`
- **Does**:
  - Install production dependencies
  - Package function code
  - Upload to Lambda
  - Wait for completion

#### `scripts/setup-secrets.sh`
- **Purpose**: Create/update Secrets Manager secrets
- **Usage**: `./scripts/setup-secrets.sh [secret-name] [connection-string]`
- **Use Case**: Initial setup of MongoDB connection string

### Configuration Files

#### `package.json`
- Node.js 24 dependencies
- Scripts for testing, linting, packaging
- AWS SDK v3 for Secrets Manager
- MongoDB native driver

#### `.eslintrc.json`
- ESLint configuration
- ES2024/Node.js 24 compatible

#### `.gitignore`
- Excludes node_modules, build artifacts, secrets

### Documentation

#### `README.md`
- Main project documentation
- Architecture overview
- Setup instructions
- Deployment guide
- Troubleshooting

#### `QUICKSTART.md`
- Step-by-step quick start guide
- Prerequisites checklist
- Initial deployment steps
- Testing instructions

#### `MIGRATION_GUIDE.md`
- Detailed migration guide from Mantle
- Code conversion examples
- Pattern mappings
- Best practices

## Adding New Routes

1. Create route file in `src/routes/` (e.g., `src/routes/users.js`)
2. Define routes with `method`, `path`, and `handler`
3. Import and add to `src/routes/index.js`

Example:
```javascript
// src/routes/users.js
export const getUserRoute = {
  method: 'GET',
  path: '/api/users/:id',
  handler: async (request) => {
    // Your logic here
  }
};

// src/routes/index.js
import { getUserRoute } from './users.js';
export const routes = [getUserRoute, ...];
```

## Environment Variables

Set via CloudFormation or Lambda configuration:
- `NODE_ENV`: Environment (dev/staging/prod)
- `MONGO_SECRET_NAME`: Secrets Manager secret name
- `MONGO_DB_NAME`: MongoDB database name
- `AWS_REGION`: AWS region

## Deployment Flow

1. **Initial Setup**: Deploy CloudFormation stack
2. **Code Deployment**: Deploy Lambda function code
3. **Updates**: Use GitHub Actions or manual deployment script
4. **Monitoring**: Check CloudWatch logs

## Key Design Decisions

1. **Native MongoDB Driver**: Using `mongodb` package instead of Mongoose for better Lambda compatibility
2. **Secrets Manager**: All sensitive data stored in AWS Secrets Manager
3. **VPC Deployment**: Lambda runs in VPC for private MongoDB access
4. **HTTP API**: Using API Gateway HTTP API (not REST API) for better performance
5. **Node.js 24**: Latest LTS version for modern JavaScript features

