# Deploy Lambda function code only (skip CloudFormation stack update)
# This script only updates the Lambda function code, not the infrastructure

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Updating Lambda Function Code Only ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Install dependencies
Write-Host "1. Installing production dependencies..." -ForegroundColor Green
try {
    npm install --production
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: npm install failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error installing dependencies: $_" -ForegroundColor Red
    exit 1
}

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

# Step 3: Update Lambda function code
Write-Host ""
Write-Host "3. Updating Lambda function code..." -ForegroundColor Green
try {
    aws lambda update-function-code `
        --function-name eventsquid-private-api `
        --zip-file fileb://function.zip `
        --region us-west-2
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Lambda update failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error updating Lambda: $_" -ForegroundColor Red
    exit 1
}

# Wait for update to complete
Write-Host ""
Write-Host "4. Waiting for update to complete..." -ForegroundColor Green
try {
    aws lambda wait function-updated `
        --function-name eventsquid-private-api `
        --region us-west-2
} catch {
    Write-Host "Warning: Wait command failed, but update may have succeeded" -ForegroundColor Yellow
}

# Cleanup
Write-Host ""
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item "function.zip" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Lambda Function Code Update Complete! ===" -ForegroundColor Green
Write-Host ""
