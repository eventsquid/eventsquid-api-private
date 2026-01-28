# MSSQL Local Development Setup Guide

This guide walks you through setting up MSSQL access for local development.

## Current MSSQL Configuration

**RDS Endpoint**: `eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com:1433`
**Region**: `us-west-2`
**Database**: `eventsquid` (and other vertical databases: launchsquid, connect, etc.)

**Problem**: RDS instance is in a VPC and not publicly accessible from your local machine.

## Solution Options

### Option 1: AWS VPN (Recommended for Long-term Use)

Best for: Regular local development, multiple developers

**Steps:**

1. **Set up AWS Client VPN** (if not already set up):
   ```bash
   # Check if VPN endpoint exists
   aws ec2 describe-client-vpn-endpoints --region us-west-2
   ```

2. **Connect to VPN**:
   - Download AWS Client VPN client
   - Import VPN configuration
   - Connect to VPN endpoint

3. **Verify connection**:
   ```bash
   # Test connectivity to RDS
   telnet eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com 1433
   ```

4. **Update `.env` file**:
   ```env
   MSSQL_HOST=eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com
   MSSQL_USERNAME=your-username
   MSSQL_PASSWORD=your-password
   MSSQL_DATABASE=eventsquid
   MSSQL_PORT=1433
   ```

**Pros:**
- Secure, official AWS solution
- Works for entire team
- No port forwarding needed

**Cons:**
- Requires VPN setup (may need AWS admin)
- Slight latency overhead

---

### Option 2: SSH Tunnel via Bastion Host (Quick Setup)

Best for: Quick setup, single developer, temporary access

**Prerequisites:**
- EC2 bastion host in the same VPC as RDS
- SSH access to bastion host
- Security group allows your IP

**Steps:**

1. **Find or create bastion host**:
   ```bash
   # List EC2 instances in VPC
   aws ec2 describe-instances \
     --region us-west-2 \
     --filters "Name=vpc-id,Values=your-vpc-id" \
     --query "Reservations[*].Instances[*].[InstanceId,PublicIpAddress,Tags[?Key=='Name'].Value|[0]]" \
     --output table
   ```

2. **Set up SSH tunnel** (Windows PowerShell):
   ```powershell
   # Install OpenSSH if not already installed
   # Windows 10/11 should have it by default

   # Create SSH tunnel
   ssh -L 1433:eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com:1433 \
       -N -f \
       ec2-user@your-bastion-host-ip
   ```

   Or use PuTTY (Windows):
   - Connection → SSH → Tunnels
   - Source port: `1433`
   - Destination: `eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com:1433`
   - Click "Add"
   - Save session and connect

3. **Update `.env` file**:
   ```env
   MSSQL_HOST=localhost
   MSSQL_USERNAME=your-username
   MSSQL_PASSWORD=your-password
   MSSQL_DATABASE=eventsquid
   MSSQL_PORT=1433
   ```

4. **Keep SSH tunnel running**:
   - Don't close the terminal/PuTTY session
   - Or run in background: `ssh -f -N ...` (Linux/Mac) or use PuTTY (Windows)

**Pros:**
- Quick to set up
- No VPN configuration needed
- Works immediately

**Cons:**
- Requires keeping SSH session open
- Need bastion host access
- Single developer use

---

### Option 3: AWS Systems Manager Session Manager (Alternative)

Best for: No SSH keys needed, AWS-native solution

**Steps:**

1. **Install AWS Session Manager Plugin**:
   ```bash
   # Download from AWS
   # https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
   ```

2. **Set up port forwarding**:
   ```bash
   aws ssm start-session \
     --target i-your-bastion-instance-id \
     --document-name AWS-StartPortForwardingSession \
     --parameters '{"portNumber":["1433"],"localPortNumber":["1433"]}'
   ```

3. **Update `.env` file** (same as SSH tunnel - use `localhost`)

**Pros:**
- No SSH keys needed
- Secure, AWS-managed
- Works through Session Manager

**Cons:**
- Requires Session Manager setup on EC2
- More complex initial setup

---

## Getting MSSQL Credentials

### From AWS Secrets Manager

```bash
# Get MSSQL credentials
aws secretsmanager get-secret-value \
  --secret-id primary-mssql/event-squid \
  --region us-west-2 \
  --query SecretString \
  --output text | jq .
```

This will return JSON like:
```json
{
  "username": "your-username",
  "password": "your-password",
  "host": "eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com",
  "port": 1433,
  "database": "eventsquid"
}
```

### Manual Configuration

If you have the credentials separately, use them directly in `.env`.

## Testing MSSQL Connection

### Option 1: Using sqlcmd (Windows)

```powershell
# Install SQL Server command-line tools if needed
# https://docs.microsoft.com/en-us/sql/tools/sqlcmd-utility

# Test connection
sqlcmd -S localhost,1433 -U your-username -P your-password -d eventsquid -Q "SELECT 1"
```

### Option 2: Using Azure Data Studio

1. Download Azure Data Studio
2. Create new connection:
   - Server: `localhost,1433` (if using tunnel) or RDS endpoint (if using VPN)
   - Authentication: SQL Login
   - Username/Password: Your credentials
   - Database: `eventsquid`
3. Test connection

### Option 3: Using Node.js Test Script

Create `test-mssql.js`:
```javascript
import { getConnection } from './src/utils/mssql.js';

async function test() {
  try {
    const connection = await getConnection('es');
    const result = await connection.sql('SELECT 1 as test').execute();
    console.log('✅ MSSQL connection successful!', result);
  } catch (error) {
    console.error('❌ MSSQL connection failed:', error.message);
  }
}

test();
```

Run: `node test-mssql.js`

## Complete .env Configuration

Once MSSQL is accessible, your `.env` should include:

```env
# MSSQL Configuration
# Option 1: Connection string format
MSSQL_CONNECTION_STRING=Server=localhost,1433;Database=eventsquid;User Id=username;Password=password;

# Option 2: Individual variables (recommended)
MSSQL_HOST=localhost  # or RDS endpoint if using VPN
MSSQL_USERNAME=your-username
MSSQL_PASSWORD=your-password
MSSQL_DATABASE=eventsquid
MSSQL_PORT=1433
```

## Verifying MSSQL Works

1. **Start local server**:
   ```bash
   npm run dev
   ```

2. **Test profiles endpoint**:
   ```bash
   curl -H "cftoken: your-token" -H "cfid: your-id" -H "vert: es" \
     http://localhost:3000/event/23513/profiles
   ```

3. **Check logs** - You should see:
   - ✅ "Successfully connected to MSSQL" (not mock connection warnings)
   - ✅ Real data returned (not empty `[]`)

## Troubleshooting

### "Failed to connect in 15000ms"
- **VPN**: Verify VPN is connected and routing works
- **SSH Tunnel**: Check tunnel is active (`netstat -an | findstr 1433`)
- **Security Groups**: Ensure RDS security group allows traffic from VPN/tunnel

### "Login failed for user"
- Verify username/password are correct
- Check user has permissions on the database
- Ensure database name matches (eventsquid, launchsquid, etc.)

### "Connection timeout"
- RDS instance may be paused (Aurora Serverless)
- Check RDS instance status in AWS Console
- Verify network connectivity

### "Cannot find module 'tedious'"
- Run `npm install` to ensure all dependencies are installed

## Next Steps

1. Choose your MSSQL access method (VPN, SSH tunnel, or Session Manager)
2. Set up the connection
3. Update `.env` with MSSQL credentials
4. Test connection using one of the methods above
5. Restart local server and test endpoints

Once MSSQL is working, endpoints like `/event/:eventID/profiles` will return real data instead of empty arrays.
