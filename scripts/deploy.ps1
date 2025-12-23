# Deployment script for manual Lambda function updates (PowerShell version)
# Usage: .\scripts\deploy.ps1 [environment] [aws-profile]

param(
    [string]$Environment = "dev",
    [string]$AwsProfile = "eventsquid"
)

$ErrorActionPreference = "Stop"

$AwsRegion = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-west-2" }
$FunctionName = "$Environment-eventsquid-api"

Write-Host "🚀 Deploying to $Environment environment..." -ForegroundColor Cyan
Write-Host "Function: $FunctionName" -ForegroundColor Cyan
Write-Host "Region: $AwsRegion" -ForegroundColor Cyan
Write-Host "Profile: $AwsProfile" -ForegroundColor Cyan

# Install production dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
npm ci --production

# Package the function
Write-Host "`n📦 Packaging Lambda function..." -ForegroundColor Yellow
$excludePatterns = @(
    '*.git*',
    '*.zip',
    'node_modules/.cache/*',
    '*.md',
    '.github/*',
    'cloudformation/*',
    '*.test.js',
    '.eslintrc*',
    'scripts/*'
)

# Create zip file
$zipFile = "function.zip"
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}

# Check if 7-Zip is available (better for Lambda packages)
$7zipPath = "C:\Program Files\7-Zip\7z.exe"
if (Test-Path $7zipPath) {
    Write-Host "Using 7-Zip for packaging..." -ForegroundColor Gray
    & $7zipPath a -tzip $zipFile `
        -xr!".git" `
        -xr!".github" `
        -xr!"cloudformation" `
        -xr!"scripts" `
        -xr!"*.md" `
        -xr!"*.test.js" `
        -xr!".eslintrc*" `
        -xr!"*.zip" `
        -xr!"node_modules\.cache" `
        .
} else {
    # Fallback to Compress-Archive (may have limitations)
    Write-Host "Using PowerShell Compress-Archive (7-Zip recommended for better results)..." -ForegroundColor Yellow
    Write-Host "Creating temporary directory for packaging..." -ForegroundColor Gray
    
    $tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
    try {
        # Copy all files except excluded patterns
        Get-ChildItem -Path . -Force | Where-Object {
            $name = $_.Name
            $exclude = $false
            if ($name -eq ".git" -or $name -eq ".github" -or $name -eq "cloudformation" -or $name -eq "scripts" -or $name -eq "function.zip") {
                $exclude = $true
            }
            if ($name -like "*.md" -or $name -like "*.test.js" -or $name -like ".eslintrc*") {
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
        
        # Remove test files and markdown from copied content
        Get-ChildItem -Path $tempDir -Filter "*.md" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
        Get-ChildItem -Path $tempDir -Filter "*.test.js" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
        Get-ChildItem -Path $tempDir -Filter ".eslintrc*" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
        
        # Create zip
        Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force
    } finally {
        Remove-Item -Path $tempDir -Recurse -Force
    }
}

# Update Lambda function code
Write-Host "`n⬆️  Uploading function code..." -ForegroundColor Yellow
aws lambda update-function-code `
    --function-name $FunctionName `
    --zip-file "fileb://$zipFile" `
    --region $AwsRegion `
    --profile $AwsProfile

# Wait for update to complete
Write-Host "`n⏳ Waiting for update to complete..." -ForegroundColor Yellow
aws lambda wait function-updated `
    --function-name $FunctionName `
    --region $AwsRegion `
    --profile $AwsProfile

# Cleanup
Remove-Item $zipFile -Force -ErrorAction SilentlyContinue

Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
Write-Host "Function: $FunctionName" -ForegroundColor Green
Write-Host "Region: $AwsRegion" -ForegroundColor Green

