# Local Development with Real Data

This guide explains how to configure local development to access **real data** instead of mock data.

## Current Status

✅ **Migration Complete**: All 247 routes are migrated and functional
⚠️ **Local Dev Issue**: Currently using mock data because:
- MongoDB connection strings lack full database permissions
- MSSQL RDS instance is not accessible from local machine (VPC-only)

## Requirements for Real Data

### 1. MongoDB Access

You need **two** MongoDB connection strings with proper permissions:

#### A. Common Database (`cm`) - Required for Authentication
```env
MONGO_COMMON_CONNECTION_STRING=mongodb+srv://user:password@cluster.mongodb.net/cm?retryWrites=true&w=majority
```

**Required Permissions:**
- Read access to `cm` database
- Collections: `cfsessions`, `dev-keys`, `config-verticals`

**How to get:**
1. Go to MongoDB Atlas → Database Access
2. Create/update a user with read permissions on `cm` database
3. Get the connection string from "Connect" → "Connect your application"
4. Update the connection string to point to `cm` database

#### B. Vertical Databases (e.g., `eventsquid`) - Required for Event Data
```env
MONGO_CONNECTION_STRING=mongodb+srv://user:password@cluster.mongodb.net/eventsquid?retryWrites=true&w=majority
```

**Required Permissions:**
- Read/write access to vertical databases (eventsquid, launchsquid, etc.)
- Collections: `events`, `attendees`, `resources`, etc.

**How to get:**
1. Use the same MongoDB Atlas cluster
2. Create/update a user with read/write permissions on vertical databases
3. Get the connection string and update database name as needed

**Important Notes:**
- Use **public** connection strings (not private endpoints like `pl-0-us-west-2.bozi8.mongodb.net`)
- Private endpoints only work from within AWS VPC
- Both connection strings can point to the same cluster, just different databases

### 2. MSSQL Access

MSSQL is required for many endpoints. You have **three options**:

**📖 See [MSSQL_LOCAL_SETUP.md](./MSSQL_LOCAL_SETUP.md) for detailed step-by-step instructions.**

#### Option A: AWS VPN (Recommended for Long-term)
Connect to AWS VPC via VPN to access RDS instance directly.

#### Option B: SSH Tunnel via Bastion Host (Quick Setup)
Use an SSH tunnel through a bastion host - fastest to set up.

#### Option C: AWS Systems Manager Session Manager (Alternative)
Use AWS Session Manager for port forwarding - no SSH keys needed.

**Quick Start (SSH Tunnel - Windows):**
```powershell
# Create SSH tunnel
ssh -L 1433:eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com:1433 -N ec2-user@your-bastion-ip

# Then in .env:
MSSQL_HOST=localhost
MSSQL_USERNAME=your-username
MSSQL_PASSWORD=your-password
MSSQL_DATABASE=eventsquid
MSSQL_PORT=1433
```

### 3. Complete .env Configuration

Create a `.env` file with all required variables:

```env
# Environment
NODE_ENV=development
PORT=3000

# AWS (for Secrets Manager fallback)
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# MongoDB - Common Database (REQUIRED for authentication)
MONGO_COMMON_CONNECTION_STRING=mongodb+srv://user:password@cluster.mongodb.net/cm?retryWrites=true&w=majority

# MongoDB - Vertical Databases (REQUIRED for event data)
MONGO_CONNECTION_STRING=mongodb+srv://user:password@cluster.mongodb.net/eventsquid?retryWrites=true&w=majority

# MSSQL (REQUIRED for profiles, regitems, agenda, etc.)
# Option 1: Connection string
MSSQL_CONNECTION_STRING=Server=host,1433;Database=eventsquid;User Id=username;Password=password;

# Option 2: Individual variables (if using VPN/bastion)
MSSQL_HOST=eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com
MSSQL_USERNAME=your-username
MSSQL_PASSWORD=your-password
MSSQL_DATABASE=eventsquid
MSSQL_PORT=1433

# Optional: S3 (if testing file uploads)
AWS_S3_BUCKET=your-bucket-name
S3_BASE_URL=https://s3-us-west-2.amazonaws.com/eventsquid/
```

## Endpoints by Data Source

### MongoDB-Only Endpoints (Work with just MongoDB)
- ✅ `/health` - Health check
- ✅ `/event/:eventID/allData` - Event data from MongoDB
- ✅ `/events` - List events (MongoDB)
- ✅ `/attendees` - Attendee data (MongoDB)
- ✅ Most attendee-related endpoints

### MSSQL-Required Endpoints (Need MSSQL for real data)
- ❌ `/event/:eventID/profiles` - Event fee bundles (MSSQL)
- ❌ `/regitems/:eventID` - Registration items/fees (MSSQL)
- ❌ `/agenda/:eventID/slots` - Agenda slots (MSSQL)
- ❌ `/eventFormPrompts/:vert/:eventID/:profileID` - Form prompts (MSSQL)
- ❌ `/credits/*` - CEU/credit endpoints (MSSQL)
- ❌ `/reports/*` - Report endpoints (MSSQL)
- ❌ `/sponsors/*` - Sponsor endpoints (MSSQL)

### Hybrid Endpoints (Use both MongoDB and MSSQL)
- ⚠️ `/event/:eventID/allData` - Uses MongoDB for event, MSSQL for fees
- ⚠️ `/attendees` - Uses MongoDB for attendees, MSSQL for registration items

## Testing Real Data Access

### 1. Test MongoDB Connection
```bash
# Test common database
curl -H "cftoken: your-token" -H "cfid: your-id" http://localhost:3000/health

# Test event data (MongoDB)
curl -H "cftoken: your-token" -H "cfid: your-id" -H "vert: es" \
  http://localhost:3000/event/23513/allData
```

### 2. Test MSSQL Connection
```bash
# Test profiles endpoint (requires MSSQL)
curl -H "cftoken: your-token" -H "cfid: your-id" -H "vert: es" \
  http://localhost:3000/event/23513/profiles
```

If MSSQL is working, you should see actual profile data instead of `[]`.

### 3. Verify No Mock Data

Check server logs - you should **NOT** see:
- ❌ "⚠️ Local dev mode: MongoDB unavailable, allowing request with mock session"
- ❌ "⚠️ MSSQL connection pool created but connections are failing"
- ❌ "⚠️ Cannot access config-verticals in cm database"

Instead, you should see:
- ✅ "Successfully connected to MongoDB common database (cm)"
- ✅ "Successfully connected to MongoDB for vertical: es"
- ✅ "Successfully connected to MSSQL"

## Troubleshooting

### MongoDB Authorization Errors

**Error**: `not authorized on cm to execute command`

**Solution**:
1. Verify `MONGO_COMMON_CONNECTION_STRING` has read permissions on `cm` database
2. Check MongoDB Atlas → Database Access → User permissions
3. Ensure connection string uses the correct database name (`cm`)

**Error**: `not authorized on eventsquid to execute command`

**Solution**:
1. Verify `MONGO_CONNECTION_STRING` has read/write permissions on vertical databases
2. Check user has access to all required databases (eventsquid, launchsquid, etc.)

### MSSQL Connection Errors

**Error**: `Failed to connect to eventsquid-platform-ear... in 15000ms`

**Solution**:
1. RDS instance is in a VPC and not publicly accessible
2. Set up AWS VPN or SSH tunnel (see options above)
3. Verify security groups allow your IP address
4. Test connection with `sqlcmd` or Azure Data Studio

**Error**: `ConnectionError: Login failed for user`

**Solution**:
1. Verify MSSQL credentials are correct
2. Check user has permissions on the database
3. Ensure database name matches (eventsquid, launchsquid, etc.)

### Getting Connection Strings from AWS

If you need to get connection strings from AWS Secrets Manager:

```bash
# Get MongoDB connection string
aws secretsmanager get-secret-value \
  --secret-id mongodb/eventsquid \
  --region us-west-2 \
  --query SecretString \
  --output text

# Get MSSQL credentials
aws secretsmanager get-secret-value \
  --secret-id primary-mssql/event-squid \
  --region us-west-2 \
  --query SecretString \
  --output text
```

## Next Steps

1. **Set up MongoDB connection strings** with proper permissions
2. **Set up MSSQL access** (VPN, bastion, or local instance)
3. **Update `.env` file** with all connection strings
4. **Restart local server** and test endpoints
5. **Verify real data** is being returned

## Migration Status Reference

See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for:
- Complete list of all 247 migrated routes
- Services and functions implemented
- What's working and what needs configuration
