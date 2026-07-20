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

## 4. `POST /images/:vert` body size vs. API Gateway limit — DEFERRED

**Decision:** Not changing. Keeping Mantle parity (same endpoint shape, same base64 body contract).

**Context:** Mantle ran on EC2 with no payload limit; Lambda + API Gateway caps inbound body at 6 MB (~4.5 MB binary after base64 overhead). Uploads larger than that fail at API Gateway with an opaque `Request Entity Too Large` before Lambda is invoked. This is a regression vs Mantle for the rare case of >6 MB images (typically only un-resized DSLR speaker photos).

**File:** `src/routes/root.js:170` (`POST /images/:vert`)

**Why deferred:**
- Typical uploads (logos, avatars, normal speaker photos) are well under the cap.
- This codebase is being sunset before the gap is likely to matter to a real customer.
- The clean fix (presigned S3 PUT URLs) is a multi-endpoint refactor with client-side coordination changes — not justified for a sunsetting codebase.

**Revisit if:** A customer reports a failed upload and the rollover to the replacement codebase is far enough out that fixing here is cheaper than waiting.

---

## 5. CloudFormation infrastructure review

**File:** `cloudformation/template.yaml`

Three items to confirm before production:

- **VPC config**: Lambda must be in the same VPC as the MSSQL RDS/EC2 instance (or have a VPC peering/endpoint route to it). Verify the `VpcConfig` block has the correct subnet IDs and security groups.
- **Reserved concurrency**: Set a `ReservedConcurrentExecutions` value to prevent this function from starving other Lambdas in the account during traffic spikes (large event opens can hit 600–1000 concurrent users).
- **CloudWatch log retention**: The log group currently has no retention policy (logs are kept indefinitely). Add a `RetentionInDays` property (e.g., 90 days) to control cost.

---

## 6. `EventService.js` missing methods — COMPLETE

**Decision:** All 11 missing methods that backed real Mantle controller routes have been ported with same request/response JSON contracts. Three additional methods (`searchEvents`, `getCouponCodes`, `getProfileNames`) flagged in the original audit were verified as dead code in Mantle (no controller routes, no internal callers) and were not ported.

**Ported methods and routes:**

| EventService method | Underlying function | Route |
|---------------------|---------------------|-------|
| `addLibraryResourceToEvent` | (logic in service) | `POST /event/:eventID/resource/fromLibrary` |
| `addVideoResource` | (logic in service) | `POST /event/:eventID/resource` |
| `getSingleResource` | `getAccessibleResources` (existing) | `GET /event/:eventGUID/resource/:videoID` |
| `moveResource` | `moveResource` (new in `functions/resources.js`) | `POST /event/:eventID/resources/move` |
| `moveResourceCategory` | `moveResourceCategory` (new) | `POST /event/:eventID/resources/categories/move` |
| `toggleAgendaSlotBinding` | `toggleAgendaSlotBinding` (new) | `POST /event/resources/slotBinding` |
| `getSponsor` | `getSponsor` (new) | `GET /event/resources/getSponsor/:sponsorID` |
| `getSlotSponsorResources` | `getSlotSponsorResources` (new) | `POST /event/resources/getSlotSponsorResources` |
| `updateResourceSponsor` | `updateResourceSponsor` (new) | `POST /event/:eventID/resources/sponsor/update` |
| `setSponsorLocationAgenda` | (direct SQL in service) | `POST /event/:eventID/sponsorLocationAgenda` |
| `sponsorInstantContact` | uses `getSponsor` + `getRegisteredAttendeeByUserID` + `sendEmail` + inline `getInstantContactEmail` template | `POST /event/:eventGUID/resources/sponsor/contact/:sponsorID` |

All ports are faithful to Mantle's request and response JSON contracts.

---

## 7. `EventService.updateEventConfig` — DEFERRED

**Decision:** Not porting before go-live. The TODO in `ReportService.js` has been removed.

**Context:** Mantle's `updateEventConfig` is a defensive MSSQL → MongoDB freshness sync that runs before `POST /reports/:eventGUID/report-config` (the only caller, from CF `report-basic.js`). It re-pulls the reg form from MSSQL when `event.lu !== event.rgu`. The full port would require ~1175 lines: `updateEventConfig` itself (~50), `updateEventProfilesMongo` (36), and `saveEventRegForm` (1089).

**Why it's deferred:**
- The response shape (the 11 fields CF reads: `rgf`, `pfs`, `pfsToFees`, `groupings`, `fees`, `boothCount`, `ebt`, `feeRef`, `eef`, `ech`, `an`) is already built correctly by `findEventReportConfig` (function) at `src/functions/reports.js:279`.
- `updateEventConfig` doesn't shape the response — it only refreshes MongoDB data the response reads. Stale data only happens if normal save flows fail to keep MongoDB in sync with MSSQL.
- If MongoDB drifts from MSSQL, the right fix is to repair the save flows, not paper over reads with this sweep.

**Revisit if:** Reports show stale reg form, profile, or fee data in production. Symptom: admin edits event/reg form, then a user opens the report config page and sees the previous version. If this happens, port the three Mantle methods or (better) audit the event-save and regform-save flows for a missing MongoDB sync step.

---

## 8. Switch SQL string interpolation to parameterized queries

**Files:**
- `src/services/EventService.js` — `getTouchEventQueries` (`safeS3`, `safeSite`)
- `src/services/AttendeeService.js` — `updateAttendeeEventDocs` (`safeS3`, `safeDomain`)

These methods read `s3RootURL`, `siteURL`, and `domain` from `request.body` and concatenate them into SQL string literals like `'${safeS3}/' + uu.filenameS3`. The current fix escapes single quotes (`'` → `''`) to neutralize string-literal terminators — adequate as a quick safety net but not the proper solution.

The proper fix is to bind these as parameters and concatenate inside SQL:

```sql
-- Before (string interpolation, escaped):
'${safeS3}/' + uu.filenameS3

-- After (parameter binding):
@s3RootURL + '/' + uu.filenameS3
```

with `request.input('s3RootURL', sql.NVarChar, s3RootURL)` on the JS side. Removes the need for the `safe*` escape variables and eliminates the injection vector entirely.

This is a low-risk refactor — both methods are already inside `try/catch` blocks and have integration coverage via the touch-event and attendee-docs flows. Track here so the temporary escape isn't forgotten.
