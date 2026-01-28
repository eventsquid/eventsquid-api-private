# Deploy to AWS using terminal commands
# This script runs AWS CLI commands to deploy directly to AWS

$ErrorActionPreference = "Stop"

Write-Host "`n=== Deploying to AWS ===" -ForegroundColor Cyan

# Step 1: Install dependencies
Write-Host "`n1. Installing production dependencies..." -ForegroundColor Green
npm install --production

# Step 2: Package Lambda function
Write-Host "`n2. Packaging Lambda function..." -ForegroundColor Green
if (Test-Path "function.zip") {
    Remove-Item "function.zip" -Force
}

# Use Compress-Archive (PowerShell built-in)
$tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
try {
    # Copy files excluding patterns
    Get-ChildItem -Path . -Force | Where-Object {
        $name = $_.Name
        $exclude = $false
        if ($name -match "^(\.git|\.github|cloudformation|function\.zip|buildspec\.yml|deploy-.*\.ps1|deploy-.*\.sh|pipeline-params\.json)$") {
            $exclude = $true
        }
        if ($name -match "\.(md|test\.js)$" -or $name -match "^\.eslintrc") {
            $exclude = $true
        }
        -not $exclude
    } | ForEach-Object {
        if ($_.PSIsContainer) {
            Copy-Item -Path $_.FullName -Destination "$tempDir\$($_.Name)" -Recurse -Force
        } else {
            Copy-Item -Path $_.FullName -Destination "$tempDir\$($_.Name)" -Force
        }
    }
    
    Compress-Archive -Path "$tempDir\*" -DestinationPath "function.zip" -Force
} finally {
    Remove-Item -Path $tempDir -Recurse -Force
}

Write-Host "Created function.zip" -ForegroundColor Green

# Step 3: Deploy CloudFormation stack
Write-Host "`n3. Deploying CloudFormation stack..." -ForegroundColor Green
aws cloudformation deploy `
    --template-file cloudformation/template.yaml `
    --stack-name eventsquid-private-api `
    --parameter-overrides `
        Environment=dev `
    --capabilities CAPABILITY_NAMED_IAM `
    --region us-west-2

# Step 4: Update Lambda function code
Write-Host "`n4. Updating Lambda function code..." -ForegroundColor Green
aws lambda update-function-code `
    --function-name eventsquid-private-api `
    --zip-file fileb://function.zip `
    --region us-west-2

# Step 5: Update Lambda configuration (preserve existing environment variables)
Write-Host "`n5. Updating Lambda function configuration..." -ForegroundColor Green

# Get current environment variables
$currentConfig = aws lambda get-function-configuration --function-name eventsquid-private-api --region us-west-2 | ConvertFrom-Json
$currentEnvVars = @{}

# Preserve existing environment variables
if ($currentConfig.Environment.Variables) {
    $currentConfig.Environment.Variables.PSObject.Properties | ForEach-Object {
        $currentEnvVars[$_.Name] = $_.Value
    }
}

# Update/add NODE_ENV
$currentEnvVars["NODE_ENV"] = "dev"

# Build environment variables string
$envVarsString = ($currentEnvVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ","

aws lambda update-function-configuration `
    --function-name eventsquid-private-api `
    --environment Variables="{$envVarsString}" `
    --region us-west-2

# Cleanup
Write-Host "`nCleaning up..." -ForegroundColor Yellow
Remove-Item "function.zip" -Force -ErrorAction SilentlyContinue

Write-Host "`n=== Deployment Complete! ===" -ForegroundColor Green

