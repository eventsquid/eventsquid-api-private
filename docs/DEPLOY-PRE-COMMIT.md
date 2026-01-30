# Pre-commit deploy: delete old stacks, create new pipelines

Run these **before** you commit and push. Use the same profile/region you use for this account (e.g. `--profile eventsquid` if needed; add to each `aws` command). Region is `us-west-2`.

---

## 1. Delete old API stack

Removes the current API stack (HTTP API or any previous eventsquid-private-api stack).

**PowerShell:**

```powershell
aws cloudformation delete-stack --stack-name eventsquid-private-api --region us-west-2
```

Wait for it to finish (1–2 min):

```powershell
aws cloudformation wait stack-delete-complete --stack-name eventsquid-private-api --region us-west-2
```

If the stack doesn’t exist, the wait will error; that’s fine. If the stack is in `ROLLBACK_COMPLETE`, delete as above (no update possible).

---

## 2. Delete old pipeline stack(s)

Remove the existing pipeline so we can create the new main + develop pipelines.

**PowerShell:**

```powershell
aws cloudformation delete-stack --stack-name eventsquid-api-pipeline --region us-west-2
```

Wait:

```powershell
aws cloudformation wait stack-delete-complete --stack-name eventsquid-api-pipeline --region us-west-2
```

If you had separate pipeline stacks (e.g. `eventsquid-api-pipeline-main` or `eventsquid-api-pipeline-develop`), delete those too:

```powershell
# Only if they exist
aws cloudformation delete-stack --stack-name eventsquid-api-pipeline-main --region us-west-2
aws cloudformation delete-stack --stack-name eventsquid-api-pipeline-develop --region us-west-2
```

Then wait for each:

```powershell
aws cloudformation wait stack-delete-complete --stack-name eventsquid-api-pipeline-main --region us-west-2
aws cloudformation wait stack-delete-complete --stack-name eventsquid-api-pipeline-develop --region us-west-2
```

(If a stack doesn’t exist, the wait will fail; ignore and continue.)

---

## 3. Create develop pipeline (branch: develop → dev stage)

From the repo root:

**PowerShell:**

```powershell
aws cloudformation create-stack `
  --stack-name eventsquid-api-pipeline-develop `
  --template-body file://cloudformation/pipeline.yaml `
  --parameters file://pipeline-stack-params.json `
  --capabilities CAPABILITY_NAMED_IAM `
  --region us-west-2
```

Wait for the stack to be created:

```powershell
aws cloudformation wait stack-create-complete --stack-name eventsquid-api-pipeline-develop --region us-west-2
```

`pipeline-stack-params.json` uses `GitHubBranch=develop` and `DeploymentEnvironment=dev` (deploys code only; dev stage uses `$LATEST`).

---

## 4. Create main pipeline (branch: main → v1 stage)

**PowerShell:**

```powershell
aws cloudformation create-stack `
  --stack-name eventsquid-api-pipeline-main `
  --template-body file://cloudformation/pipeline.yaml `
  --parameters file://pipeline-stack-params-main.json `
  --capabilities CAPABILITY_NAMED_IAM `
  --region us-west-2
```

Wait:

```powershell
aws cloudformation wait stack-create-complete --stack-name eventsquid-api-pipeline-main --region us-west-2
```

`pipeline-stack-params-main.json` uses `GitHubBranch=main` and `DeploymentEnvironment=prod` (deploys code, publishes version, updates alias `live` for v1).

---

## 5. Optional: create the API stack manually (before first push)

If you want the API stack to exist before the first pipeline run, run once (from repo root):

**PowerShell:**

```powershell
aws cloudformation create-stack `
  --stack-name eventsquid-private-api `
  --template-body file://cloudformation/template.yaml `
  --parameters `
    "ParameterKey=VpcId,ParameterValue=vpc-38dc235f" `
    'ParameterKey=SubnetIds,ParameterValue=subnet-3c625f4a,subnet-3a650c62,subnet-0a504b6e' `
  --capabilities CAPABILITY_NAMED_IAM `
  --region us-west-2
```

Then wait:

```powershell
aws cloudformation wait stack-create-complete --stack-name eventsquid-private-api --region us-west-2
```

If you skip this, the **develop** pipeline will create the API stack on the first run (when you push to `develop`).

---

## 6. Commit and push

After the pipelines are created (and optionally the API stack):

- Push to **develop** → develop pipeline runs: deploys code; **dev** stage uses `$LATEST`.
- Push to **main** → main pipeline runs: deploys code, publishes version, updates **live**; **v1** stage uses that version.

**Note:** The **v1** stage only works after the **main** pipeline has run at least once (it creates the `live` alias).

---

## Quick reference

| Step | Action | Command |
|------|--------|--------|
| 1 | Delete API stack | `delete-stack --stack-name eventsquid-private-api` |
| 2 | Delete old pipeline(s) | `delete-stack --stack-name eventsquid-api-pipeline` (and -main/-develop if present) |
| 3 | Create develop pipeline | `create-stack --stack-name eventsquid-api-pipeline-develop --parameters file://pipeline-stack-params.json` |
| 4 | Create main pipeline | `create-stack --stack-name eventsquid-api-pipeline-main --parameters file://pipeline-stack-params-main.json` |
| 5 | (Optional) Create API stack | `create-stack --stack-name eventsquid-private-api` with VpcId + SubnetIds |
| 6 | Commit and push | Push to develop or main to trigger the corresponding pipeline |

All commands use `--region us-west-2`. Add `--profile eventsquid` (or your profile) if needed.
