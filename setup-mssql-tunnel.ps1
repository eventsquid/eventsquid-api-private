# PowerShell script to set up SSH tunnel for MSSQL access
# This creates a tunnel from localhost:1433 to the RDS instance through a bastion host

param(
    [Parameter(Mandatory=$true)]
    [string]$BastionHost,
    
    [Parameter(Mandatory=$false)]
    [string]$BastionUser = "ec2-user",
    
    [Parameter(Mandatory=$false)]
    [string]$RdsHost = "eventsquid-platform-ear.cw2thtkmh3xo.us-west-2.rds.amazonaws.com",
    
    [Parameter(Mandatory=$false)]
    [int]$RdsPort = 1433,
    
    [Parameter(Mandatory=$false)]
    [int]$LocalPort = 1433,
    
    [Parameter(Mandatory=$false)]
    [string]$SshKey = ""
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Setting up MSSQL SSH Tunnel ===" -ForegroundColor Cyan
Write-Host "Bastion Host: $BastionHost" -ForegroundColor Yellow
Write-Host "RDS Endpoint: $RdsHost:$RdsPort" -ForegroundColor Yellow
Write-Host "Local Port: $LocalPort" -ForegroundColor Yellow

# Check if port is already in use
$portInUse = Get-NetTCPConnection -LocalPort $LocalPort -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "`n⚠️  Port $LocalPort is already in use!" -ForegroundColor Red
    Write-Host "   Either stop the existing connection or use a different port" -ForegroundColor Yellow
    Write-Host "   Example: .\setup-mssql-tunnel.ps1 -BastionHost your-host -LocalPort 1434" -ForegroundColor Yellow
    exit 1
}

# Build SSH command
$sshCommand = "ssh -L ${LocalPort}:${RdsHost}:${RdsPort} -N -f"

if ($SshKey) {
    $sshCommand += " -i `"$SshKey`""
}

$sshCommand += " ${BastionUser}@${BastionHost}"

Write-Host "`nExecuting SSH tunnel command..." -ForegroundColor Green
Write-Host "Command: $sshCommand" -ForegroundColor Gray

try {
    # Execute SSH command
    Invoke-Expression $sshCommand
    
    # Wait a moment for tunnel to establish
    Start-Sleep -Seconds 2
    
    # Verify tunnel is active
    $tunnelActive = Get-NetTCPConnection -LocalPort $LocalPort -ErrorAction SilentlyContinue
    if ($tunnelActive) {
        Write-Host "`n✅ SSH tunnel established successfully!" -ForegroundColor Green
        Write-Host "   Local port $LocalPort is now forwarding to $RdsHost:$RdsPort" -ForegroundColor Green
        Write-Host "`n📝 Update your .env file:" -ForegroundColor Cyan
        Write-Host "   MSSQL_HOST=localhost" -ForegroundColor Yellow
        Write-Host "   MSSQL_PORT=$LocalPort" -ForegroundColor Yellow
        Write-Host "   MSSQL_USERNAME=your-username" -ForegroundColor Yellow
        Write-Host "   MSSQL_PASSWORD=your-password" -ForegroundColor Yellow
        Write-Host "   MSSQL_DATABASE=eventsquid" -ForegroundColor Yellow
        Write-Host "`n⚠️  Keep this PowerShell window open to maintain the tunnel" -ForegroundColor Yellow
        Write-Host "   Press Ctrl+C to close the tunnel" -ForegroundColor Yellow
    } else {
        Write-Host "`n⚠️  Tunnel command executed, but port $LocalPort is not active" -ForegroundColor Yellow
        Write-Host "   Check SSH connection and try again" -ForegroundColor Yellow
    }
} catch {
    Write-Host "`n❌ Failed to establish SSH tunnel" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Verify bastion host is accessible: ssh $BastionUser@$BastionHost" -ForegroundColor Yellow
    Write-Host "2. Check SSH key permissions (if using key)" -ForegroundColor Yellow
    Write-Host "3. Verify RDS endpoint is correct" -ForegroundColor Yellow
    exit 1
}
