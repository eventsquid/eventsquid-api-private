# Local Development Guide

This guide explains how to run and test the Lambda function locally without deploying to AWS.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory (optional - you can also use system environment variables):
   ```env
   NODE_ENV=development
   AWS_REGION=us-west-2
   AWS_ACCESS_KEY_ID=your-access-key-id
   AWS_SECRET_ACCESS_KEY=your-secret-access-key
   MONGO_SECRET_NAME=mongodb/eventsquid
   MONGO_DB_NAME=eventsquid
   
   # Optional: Use direct MongoDB connection strings (bypasses Secrets Manager)
   # MONGO_CONNECTION_STRING=mongodb+srv://user:password@cluster.mongodb.net/database?retryWrites=true&w=majority
   # MONGO_COMMON_CONNECTION_STRING=mongodb+srv://user:password@cluster.mongodb.net/cm?retryWrites=true&w=majority
   # Note: MONGO_COMMON_CONNECTION_STRING is required for authentication (sessions, dev tokens)
   
   # Optional: Use direct MSSQL connection (bypasses Secrets Manager)
   # Option 1: Connection string format
   # MSSQL_CONNECTION_STRING=Server=host,1433;Database=eventsquid;User Id=username;Password=password;
   # Option 2: Individual variables
   # MSSQL_HOST=your-mssql-server.database.windows.net
   # MSSQL_USERNAME=your-username
   # MSSQL_PASSWORD=your-password
   # MSSQL_DATABASE=eventsquid
   # MSSQL_PORT=1433
   ```

3. **Start the local server:**
   ```bash
   npm run dev
   ```

4. **Test the API:**
   ```bash
   # Health check
   curl http://localhost:3000/health
   
   # Or with stage prefix
   curl http://localhost:3000/dev/health
   ```

## How It Works

The local server (`local-server.js`) mimics AWS API Gateway's HTTP API format:
- Converts Express.js requests to API Gateway event format
- Calls your Lambda handler function
- Converts Lambda responses back to HTTP responses

## Environment Variables

The following environment variables are used:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | No | `development` |
| `AWS_REGION` | AWS region for Secrets Manager | Yes | `us-west-2` |
| `AWS_ACCESS_KEY_ID` | AWS access key | Yes* | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes* | - |
| `MONGO_SECRET_NAME` | MongoDB secret name in Secrets Manager | Yes | `mongodb/eventsquid` |
| `MONGO_DB_NAME` | MongoDB database name | Yes | `eventsquid` |
| `MONGO_CONNECTION_STRING` | Direct MongoDB connection string for vertical databases | No* | - |
| `MONGO_COMMON_CONNECTION_STRING` | Direct MongoDB connection string for common database (cm) | No* | - |
| `MSSQL_CONNECTION_STRING` | Direct MSSQL connection string | No* | - |
| `MSSQL_HOST` | MSSQL server hostname | No* | - |
| `MSSQL_USERNAME` | MSSQL username | No* | - |
| `MSSQL_PASSWORD` | MSSQL password | No* | - |
| `MSSQL_DATABASE` | MSSQL database name | No* | `eventsquid` |
| `MSSQL_PORT` | MSSQL port | No* | `1433` |
| `PORT` | Local server port | No | `3000` |

*Required if you need to access AWS Secrets Manager for MongoDB/MSSQL credentials

## Testing Endpoints

### Health Check
```bash
GET http://localhost:3000/health
```

### With Authentication
```bash
# Using cftoken/cfid
curl -H "cftoken: your-token" -H "cfid: your-id" http://localhost:3000/events

# Using devtoken
curl -H "devtoken: your-dev-token" http://localhost:3000/events
```

### With Vertical
```bash
curl -H "vert: es" http://localhost:3000/events
```

## Local MongoDB (Optional)

If you want to use a local MongoDB instead of AWS Secrets Manager:

1. Set up a local MongoDB instance
2. Override the connection in your code or use environment variables
3. The code will attempt to connect to `mongodb://localhost:27017` if no secret is found

## Troubleshooting

### "Cannot find module 'express'"
Run `npm install` to install dev dependencies.

### "AWS credentials not configured"
Make sure you have AWS credentials set up either:
- In `.env` file
- As system environment variables
- In `~/.aws/credentials` file

### "MongoDB connection failed"
- Check that your AWS credentials have access to Secrets Manager
- Verify the secret name matches `MONGO_SECRET_NAME`
- If using local MongoDB, ensure it's running on `localhost:27017`

### "not authorized on cm to execute command"
- Make sure `MONGO_COMMON_CONNECTION_STRING` is set in your `.env` file
- Verify the connection string has access to the `cm` database
- The common database connection string must have proper permissions for the `cm` database

### "MSSQL connection failed" or "Failed to retrieve MSSQL credentials"
- MSSQL is optional for local development - the server will continue without it
- To enable MSSQL locally, set `MSSQL_CONNECTION_STRING` or individual `MSSQL_HOST/USERNAME/PASSWORD` variables
- MSSQL connection string format: `Server=host,1433;Database=db;User Id=user;Password=pass;`
- Note: MSSQL features will be unavailable without credentials, but the API will still work for MongoDB-only endpoints

### Port already in use
Change the port:
```bash
PORT=3001 npm run dev
```

## Endpoints Requiring MSSQL

Some endpoints require MSSQL access and will return empty data (`[]`) in local dev if MSSQL is unavailable:

- `/event/:eventID/profiles` - Returns event fee bundles/profiles
- `/event/:eventID` (PUT) - Updates event data
- `/eventFormPrompts/:vert/:eventID/:profileID` - Gets form prompts
- `/regitems/:eventID` - Gets registration items/fees
- `/agenda/:eventID/slots` - Gets agenda slots (may be partial)
- Many CEU/credit-related endpoints

**To get real data from these endpoints:**
1. Set `MSSQL_CONNECTION_STRING` or `MSSQL_HOST/USERNAME/PASSWORD` in `.env`
2. Ensure your local machine can access the MSSQL server (may require VPN or bastion host)
3. Note: RDS instances are typically only accessible from within the AWS VPC

**Endpoints that work with MongoDB only:**
- `/event/:eventID/allData` - Gets event data from MongoDB
- `/health` - Health check
- Most attendee-related endpoints (if they only use MongoDB)

## Differences from AWS Lambda

1. **Cold starts**: Local server doesn't have Lambda's cold start behavior
2. **Timeout**: No 30-second timeout limit locally
3. **Memory**: Uses your machine's available memory
4. **VPC**: No VPC restrictions locally
5. **Environment**: Uses local environment variables instead of Lambda environment variables

## Getting Real Data Locally

By default, local dev uses mock data when databases are unavailable. To get **real data**:

1. **Set up MongoDB connection strings** with full database permissions:
   - `MONGO_COMMON_CONNECTION_STRING` - Must have access to `cm` database
   - `MONGO_CONNECTION_STRING` - Must have access to vertical databases

2. **Set up MSSQL access** (one of these options):
   - AWS VPN connection to VPC
   - SSH tunnel through bastion host
   - Local MSSQL instance (not recommended)

3. **See [LOCAL_DEV_REAL_DATA.md](./LOCAL_DEV_REAL_DATA.md)** for detailed instructions

## Next Steps

Once you've tested locally:
1. Fix any issues you find
2. Deploy to AWS using `deploy-lambda-only.ps1`
3. Test in the actual Lambda environment
