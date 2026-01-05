# Pipeline Migration Guide

## Migrating from GitHub Actions to AWS CodePipeline

### Current Stack Status

If you have an existing CloudFormation stack created by GitHub Actions, you have two options:

#### Option 1: Keep Existing Stack (Recommended)

**Pros:**
- No downtime
- No data loss
- Pipeline will seamlessly take over management
- Existing Lambda function and API Gateway remain intact

**Steps:**
1. Verify your existing stack parameters match what the pipeline will use:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name eventsquid-private-api \
     --query 'Stacks[0].Parameters' \
     --profile eventsquid
   ```

2. Deploy the pipeline stack (it will update the existing Lambda stack on first run)

3. The pipeline will update the existing stack going forward

**When to use:** If your stack is working and you want a smooth transition.

#### Option 2: Delete and Recreate (Clean Slate)

**Pros:**
- Fresh start with pipeline-managed resources
- Ensures all resources are created by the pipeline
- Good for testing the pipeline setup

**Cons:**
- Brief downtime during deletion/recreation
- Need to verify all resources are recreated correctly

**Steps:**
1. Delete the existing stack:
   ```bash
   aws cloudformation delete-stack \
     --stack-name eventsquid-private-api \
     --profile eventsquid
   ```

2. Wait for deletion to complete (check CloudFormation console)

3. Deploy the pipeline stack

4. The pipeline will create a fresh stack on first deployment

**When to use:** If the stack is not in production and you want to test the full pipeline flow.

### Recommended Approach

Since you mentioned it's **not in production**, I recommend **Option 2 (Delete and Recreate)** for a clean migration:

1. **Delete the existing stack:**
   ```bash
   # Check what stacks exist
   aws cloudformation list-stacks \
     --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
     --query 'StackSummaries[?contains(StackName, `eventsquid-api`)].StackName' \
     --profile eventsquid
   
   # Delete the stack (replace with your actual stack name)
   aws cloudformation delete-stack \
     --stack-name eventsquid-private-api \
     --profile eventsquid
   ```

2. **Wait for deletion** (check CloudFormation console or use):
   ```bash
   aws cloudformation describe-stacks \
     --stack-name eventsquid-private-api \
     --query 'Stacks[0].StackStatus' \
     --profile eventsquid
   ```
   Wait until it returns an error (stack not found) or shows `DELETE_COMPLETE`.

3. **Deploy the pipeline stack** (as documented in README.md)

4. **Trigger the pipeline** by pushing to your branch, and it will create the stack fresh

### Verifying the Migration

After the pipeline runs:

1. **Check the stack was created/updated:**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name eventsquid-private-api \
     --query 'Stacks[0].[StackName,StackStatus,CreationTime]' \
     --profile eventsquid
   ```

2. **Verify Lambda function:**
   ```bash
   aws lambda get-function \
     --function-name eventsquid-private-api \
     --query 'Configuration.[FunctionName,LastModified,Runtime]' \
     --profile eventsquid
   ```

3. **Check API Gateway:**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name eventsquid-private-api \
     --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
     --output text \
     --profile eventsquid
   ```

### Disabling GitHub Actions

After the pipeline is working:

1. You can disable GitHub Actions by renaming the workflow file:
   ```bash
   mv .github/workflows/deploy.yml .github/workflows/deploy.yml.disabled
   ```

2. Or delete it if you're confident the pipeline works:
   ```bash
   rm .github/workflows/deploy.yml
   ```

### Troubleshooting

**If the pipeline fails to update an existing stack:**
- Check that the stack parameters match what the pipeline is trying to deploy
- Verify IAM permissions for CodeBuild role
- Check CloudFormation stack events for specific errors

**If you want to keep both temporarily:**
- You can keep GitHub Actions enabled while testing the pipeline
- Just make sure they don't conflict (different branches or manual triggers only)

