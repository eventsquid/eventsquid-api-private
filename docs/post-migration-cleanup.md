# Post-Migration Cleanup

Deferred items from the Mantle → Lambda migration. None of these are blockers, but each should be resolved before this API is considered production-complete.

---

## 1. `/download/:fileGUID/:checkID` route

**File:** `src/routes/download.js`, `src/services/DownloadService.js`

The route exists and is reachable, but always returns 404. The file-writing producer (a ColdFusion job that placed export files in S3 under `temp/`) was never ported to Node.js — neither in Mantle nor in Lambda. Both systems are equally broken. The route can be removed when convenient, or left as a placeholder until a new export-file delivery mechanism is designed.

---

## 2. Diagnostic `console.log` statements

Approximately 42 diagnostic `console.log` calls are scattered across the service layer (confirmed via grep at time of migration). These were useful during development but will produce noisy CloudWatch logs at production scale. Before scaling, replace with a structured logger (e.g., `pino`) or remove entirely.

---

## 3. Placeholder comments in `EventService.js` and `AttendeeService.js`

Both files had header comments noting unimplemented gaps at the time of the initial Lambda scaffold. Those gaps have since been filled. Remove any remaining `// TODO: port from Mantle` or similar placeholder comments from the tops of those files.

---

## 4. `POST /images/:vert` body size vs. API Gateway limit

**File:** `src/routes/images.js` (or wherever the image upload route lives)

The local dev server applies a 50 MB body parser limit, but AWS API Gateway has a hard 6 MB payload limit. Any image upload larger than 6 MB will be rejected at the gateway before Lambda is invoked. Options:
- Switch to presigned S3 PUT URLs (client uploads directly to S3, bypassing API Gateway entirely)
- Enforce a ≤ 6 MB limit client-side and document it

---

## 5. CloudFormation infrastructure review

**File:** `cloudformation/template.yaml`

Three items to confirm before production:

- **VPC config**: Lambda must be in the same VPC as the MSSQL RDS/EC2 instance (or have a VPC peering/endpoint route to it). Verify the `VpcConfig` block has the correct subnet IDs and security groups.
- **Reserved concurrency**: Set a `ReservedConcurrentExecutions` value to prevent this function from starving other Lambdas in the account during traffic spikes (large event opens can hit 600–1000 concurrent users).
- **CloudWatch log retention**: The log group currently has no retention policy (logs are kept indefinitely). Add a `RetentionInDays` property (e.g., 90 days) to control cost.

---

## 6. `EventService.js` missing methods

Eight methods were identified during the migration audit as present in Mantle but absent from Lambda's `EventService`. Before those call sites go live, each needs a decision: port it or confirm the route/feature is retired.

Retrieve the full list from the migration audit notes or by diffing Mantle's `services/EventService.js` method names against Lambda's. Medium-risk items include anything called from report or CEU routes.

---

## 7. `EventService.updateEventConfig` — port vs. retire

**File:** `src/services/ReportService.js`

There is a `// TODO` comment in `ReportService.js` where a call to `EventService.updateEventConfig` has been commented out. The method does not exist in Lambda's `EventService`. Decide whether to:
- Port `updateEventConfig` from Mantle and wire it back in, or
- Confirm the report flow no longer needs it and delete the TODO comment
