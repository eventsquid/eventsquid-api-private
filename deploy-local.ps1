# Local deployment script for eventsquid-private-api
# This script packages and deploys the Lambda function directly from your local machine

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-west-2",
    
    [Parameter(Mandatory=$false)]
    [string]$Profile = "eventsquid"
)

Write-Host "`n=== Deploying eventsquid-private-api ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host "Profile: $Profile`n" -ForegroundColor Yellow

# Step 1: Install production dependencies
Write-Host "Step 1: Installing production dependencies..." -ForegroundColor Green
npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: npm install failed" -ForegroundColor Red
    exit 1
}

# Step 2: Package Lambda function
Write-Host "`nStep 2: Packaging Lambda function..." -ForegroundColor Green
if (Test-Path "function.zip") {
    Remove-Item "function.zip"
}

# Create zip file excluding unnecessary files
$excludePatterns = @(
    "*.git*",
    "*.zip",
    "node_modules/.cache/*",
    "*.md",
    ".github/*",
    "cloudformation/*",
    "*.test.js",
    ".eslintrc*",
    "buildspec.yml",
    "deploy-*.ps1",
    "deploy-*.sh",
    "pipeline-params.json"
)

# Use 7-Zip or Compress-Archive
$itemsToZip = Get-ChildItem -Path . -Exclude $excludePatterns
Compress-Archive -Path $itemsToZip -DestinationPath "function.zip" -Force

if (-not (Test-Path "function.zip")) {
    Write-Host "Error: Failed to create function.zip" -ForegroundColor Red
    exit 1
}

$zipSize = (Get-Item "function.zip").Length / 1MB
Write-Host "Created function.zip ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green

# Step 3: Deploy/Update CloudFormation stack
Write-Host "`nStep 3: Deploying CloudFormation stack..." -ForegroundColor Green
aws cloudformation deploy `
    --template-file cloudformation/template.yaml `
    --stack-name eventsquid-private-api `
    --parameter-overrides `
        Environment=$Environment `
        VpcId=vpc-38dc235f `
        SubnetIds=subnet-3c625f4a,subnet-3a650c62,subnet-0a504b6e `
        MongoSecretName=mongodb/eventsquid `
        MongoDbName=eventsquid `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $Region `
    --profile $Profile

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: CloudFormation deployment failed" -ForegroundColor Red
    exit 1
}

# Step 4: Update Lambda function code
Write-Host "`nStep 4: Updating Lambda function code..." -ForegroundColor Green
aws lambda update-function-code `
    --function-name eventsquid-private-api `
    --zip-file fileb://function.zip `
    --region $Region `
    --profile $Profile

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Lambda function code update failed" -ForegroundColor Red
    exit 1
}

# Step 5: Update Lambda function configuration
Write-Host "`nStep 5: Updating Lambda function configuration..." -ForegroundColor Green
aws lambda update-function-configuration `
    --function-name eventsquid-private-api `
    --environment Variables="{NODE_ENV=$Environment,MONGO_SECRET_NAME=mongodb/eventsquid,MONGO_DB_NAME=eventsquid}" `
    --region $Region `
    --profile $Profile

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Lambda function configuration update failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Deployment Complete! ===" -ForegroundColor Green
Write-Host "Function: eventsquid-private-api" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Cyan
Write-Host "Region: $Region`n" -ForegroundColor Cyan

# Cleanup
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item "function.zip" -ErrorAction SilentlyContinue

Write-Host "Done!`n" -ForegroundColor Green

