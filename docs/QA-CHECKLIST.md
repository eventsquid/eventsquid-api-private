# QA Testing Checklist

## How to use this document

- Work through each section top to bottom
- Mark each item: ✅ Pass | ❌ Fail | ⚠️ Partial | ⏭️ Skipped
- Note the environment, date, and tester on each test run
- Items marked **[STUB]** are known to be unimplemented — they will return fake success responses and should not be treated as passing

**Test run info**

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Environment | dev / v1 |
| Vertical (`vert`) | |

---

## 1. Authorize.Net

> **Status:** Charge is implemented. Refund and void were recently implemented (migrated from Mantle). These are the highest-priority flows to verify end-to-end.

### 1.1 Prerequisites

- [ ] Confirm a sandbox AuthNet gateway config exists for the test affiliate (`/authnet/publicKeyByAffiliate/:affiliateID` returns a `publicClientKey`)
- [ ] Confirm `auth_sandbox = 1` on the test gateway config (do not run charges against production)
- [ ] Have a valid test card opaque data token (from Authorize.Net Accept.js or sandbox)

---

### 1.2 Get Public Key

| # | Step | Expected |
|---|------|----------|
| 1.2.1 | `GET /authnet/publicKeyByAffiliate/:affiliateID` | Returns `{ login, publicClientKey, testMode, auth_sandbox }` |
| 1.2.2 | `GET /authnet/publicKeyByAttendee/:attendeeID` | Same shape, resolves affiliate via attendee |
| 1.2.3 | Call with unknown affiliateID | Returns `{ error: 'no credentials found' }` |

---

### 1.3 Charge (pay-by-card)

Endpoint: `POST /authnet/pay`

Required body fields: `affiliateID`, `dataDescriptor`, `dataValue`, `amount`, `c` (contestantID)

| # | Step | Expected |
|---|------|----------|
| 1.3.1 | Submit valid charge with sandbox token | Returns transaction details object with `transId` |
| 1.3.2 | Verify `transId` is non-zero | Confirms gateway accepted the charge |
| 1.3.3 | Check MSSQL `contestant_transactions` for new row | Row exists with correct amount and `payMethod = 'authnet'` |
| 1.3.4 | Check MongoDB `attendees` for updated `tr` and `tp` fields | `tp` reflects new total paid |
| 1.3.5 | Submit with missing `dataValue` | Returns error response (no charge attempted) |
| 1.3.6 | Submit with `amount: 0` | Verify gateway rejects or API rejects before sending |
| 1.3.7 | Submit `multiCheckout: true` | Verify multi-checkout flow does not attempt to record transaction individually |

---

### 1.4 Get Transaction Details

Endpoint: `GET /authnet/transactionDetails/:affiliateID/:transactionID`

| # | Step | Expected |
|---|------|----------|
| 1.4.1 | Fetch details for a known settled transaction | Returns `transaction` object with `transactionStatus`, `payment.creditCard`, amounts |
| 1.4.2 | Fetch details for a pending-settlement transaction | Returns `transactionStatus: 'capturedPendingSettlement'` |
| 1.4.3 | Fetch with invalid `transactionID` | Returns AuthNet error response (not a 500) |

---

### 1.5 Refund

Endpoint: `DELETE /authnet/refund/:contestantID/:affiliateID/:transactionID/:refundAmount`

> **Note:** If the transaction status is `capturedPendingSettlement`, the API will automatically route to void instead of refund. Both paths call `recordRefund` after completion.

| # | Step | Expected |
|---|------|----------|
| 1.5.1 | Refund a fully settled transaction with partial amount | Returns AuthNet response with `responseCode: 1`; MSSQL `contestant_transactions` gains a negative-amount row; MongoDB `attendees.tp` decreases |
| 1.5.2 | Refund a fully settled transaction with full amount | Same as 1.5.1; `attendees.nd` (net due) should return to 0 |
| 1.5.3 | Attempt refund on a `capturedPendingSettlement` transaction | API detects status and routes to **void** flow (see 1.6); does NOT return stub error |
| 1.5.4 | Attempt refund for more than the original amount | AuthNet should decline; verify `recordRefund` is called with `amount: 0` and failure notes |
| 1.5.5 | Confirm MSSQL proc `node_recordRefund` was called | Check `contestant_transactions` for refund row |
| 1.5.6 | Confirm MongoDB sync after refund | `attendees.tr` (transaction list) and `attendees.tp` (total paid) updated; `attendees.nd` (net due) updated |

---

### 1.6 Void (pending-settlement path)

> Triggered automatically via `DELETE /authnet/refund/...` when the transaction status is `capturedPendingSettlement`. There is no separate void endpoint.

| # | Step | Expected |
|---|------|----------|
| 1.6.1 | Trigger refund on a pending-settlement transaction | Void transaction submitted to AuthNet; `responseCode: 1` on success |
| 1.6.2 | Verify all affected attendees updated | For group checkouts, each contestant tied to the transaction gets a `recordRefund` call |
| 1.6.3 | Verify MSSQL rows | `contestant_transactions` gains rows for each affected attendee with negative amounts and `rfn: 'Void of unsettled transaction'` |
| 1.6.4 | Verify MongoDB sync | `attendees.tr` and `attendees.tp` updated for each affected attendee |
| 1.6.5 | Simulate void failure (e.g. already voided) | AuthNet declines; `contestant_transactions` rows recorded with `amount: 0` and failure notes |

---

### 1.7 Hosted Payment Form

Endpoint: `GET /authnet/getPaymentForm/:login/:key/:payAmount/:contestantID/:affiliateID`

| # | Step | Expected |
|---|------|----------|
| 1.7.1 | Call with valid credentials and contestantID | Returns `{ token }` for hosted payment page |
| 1.7.2 | Call with invalid credentials | Returns AuthNet error (not a 500) |
| 1.7.3 | Call with unknown contestantID | Returns `{ error: 'Contestant not found' }` |

---

### 1.8 Multi-Checkout

Endpoint: `GET /authnet/checkMultiCheckout/:contestantID`

| # | Step | Expected |
|---|------|----------|
| 1.8.1 | Contestant with `multicheckout` set | Returns `{ multiCheckout: true, contestants: [...] }` |
| 1.8.2 | Contestant without `multicheckout` | Returns `{ multiCheckout: false }` |

---

## 2. Vantiv / Worldpay

> **Status:** Both service methods are now fully implemented. Credentials are fetched from MSSQL `affiliateMerchant`, XML is built via jstoxml and posted to `https://certtransaction.elementexpress.com/`, and the response is parsed with xml-js. `creditCardReturn` calls `recordRefund` on both success and failure paths. Routes require authentication (`cftoken`/`cfid`) and the `vert` header.

### 2.1 Prerequisites

- [ ] Confirm a Vantiv/Worldpay gateway config exists for the test affiliate in `affiliateMerchant` (`vwAccountToken`, `vwAcceptorID`, `vwAccountID`, `vwApplicationID`)
- [ ] Confirm the gateway config points to the cert/sandbox endpoint (the endpoint is currently hardcoded to `certtransaction.elementexpress.com`)

---

### 2.2 Transaction Setup

Endpoint: `POST /vantiv-worldpay/transactionSetup`

Required body fields: `affiliateID`, `transactionAmount`, `returnURL`, `referenceNumber`, `ticketNumber`, `esTID`, `eventID`

| # | Step | Expected |
|---|------|----------|
| 2.2.1 | Submit valid setup request with sandbox credentials | Returns `{ transactionSetupID }` from gateway |
| 2.2.2 | Render hosted payment iframe using `transactionSetupID` | Payment form loads in iframe |
| 2.2.3 | Submit with unknown `affiliateID` | Returns 500 with `No Vantiv/Worldpay credentials found` error |
| 2.2.4 | Submit without authentication headers | Returns 401 |
| 2.2.5 | Submit without `vert` header | Returns 400 from `verticalCheck` |

---

### 2.3 Credit Card Return (Refund)

Endpoint: `DELETE /vantiv-worldpay/refund/:contestantID/:affiliateID/:transactionID/:refundAmount`

| # | Step | Expected |
|---|------|----------|
| 2.3.1 | Refund a valid transaction | Returns gateway response with `response.code: 0` and `response.msg: "Approved"`; MSSQL `contestant_transactions` gains a negative-amount row; MongoDB `attendees.tp` decreases |
| 2.3.2 | Confirm `recordRefund` called on success | `attendees.tr` and `attendees.tp` updated; `contestant_transactions` row has `py = 'vantiv-worldpay REFUND'` |
| 2.3.3 | Attempt refund exceeding original amount | Gateway declines; `recordRefund` called with `amount: 0` and `rfn` containing failure message and code |
| 2.3.4 | Confirm `contestant_transactions` row on failure | Row written with `amount: 0` and failure notes |
| 2.3.5 | Submit without authentication headers | Returns 401 |
| 2.3.6 | Submit without `vert` header | Returns 400 |

---

## 3. Stripe

> **Status:** Webhook logging only. Stripe does not handle charge or refund flows through this API — those are managed client-side via the Stripe SDK. This API only records the webhook notification.

| # | Step | Expected |
|---|------|----------|
| 3.1 | `POST /stripe` with a Stripe webhook payload that includes `metadata.regType` | Returns `{ status: 'success' }`; MongoDB `cm.stripe-logs` gains a new document |
| 3.2 | `POST /stripe` with a payload without `metadata.regType` | Returns `{ status: 'success' }` but **no log written** (by design) |
| 3.3 | `POST /stripe` with malformed JSON | Returns error response |
| 3.4 | Confirm no authentication required on this endpoint | Should accept requests without `cftoken`/`cfid` headers |

**Known gap:** No charge, refund, or void flow — Stripe is configuration + client-side only in this codebase.

---

## 4. PayZang

> **⚠️ CONFIG ONLY — NOT IMPLEMENTED**
>
> PayZang has no service class, no route handlers, and no payment processing logic. It appears only in affiliate/gateway configuration functions. There is nothing to test at the API level.

| # | Test | Known Behavior |
|---|------|---------------|
| 4.1 | Verify `payZangTokenizationKey` and `payZangSecurityKey` can be saved to affiliate gateway config | Config write/read works (affiliate functions are implemented) |
| 4.2 | Attempt any PayZang payment flow | No endpoint exists — 404 |

**Gap:** Full implementation would require new service and route files. No Mantle equivalent was found.

---

## 5. CEU / Credit Auto-Grant

### 5.1 Credit Category Management (implemented — regression baseline)

> These functions are fully implemented. Verify they are not broken before testing grant flows.

| # | Step | Expected |
|---|------|----------|
| 5.1.1 | Fetch event credit categories | Returns category list with state/jurisdiction mappings |
| 5.1.2 | Create a new credit category | Returns new category ID; appears in subsequent fetch |
| 5.1.3 | Update a credit category name/code | Change persists |
| 5.1.4 | Archive a credit category | Category removed from active list; verify `checkCatAssignedToRegItem` blocks archive if in use |
| 5.1.5 | Attempt duplicate name+code combo | Returns validation error |

---

### 5.2 Award Criteria Packages (implemented)

| # | Step | Expected |
|---|------|----------|
| 5.2.1 | Create an award criteria package | Returns new package; persists in DB |
| 5.2.2 | Edit a package | Changes persist |
| 5.2.3 | Reset a package | Criteria cleared; package remains |
| 5.2.4 | Delete a package | Package removed |
| 5.2.5 | Fetch attendees eligible to award for a given package | Returns filtered attendee list |
| 5.2.6 | Fetch attendees eligible to decline | Returns filtered list |

---

### 5.3 Exception Log (implemented)

| # | Step | Expected |
|---|------|----------|
| 5.3.1 | Add an award exception | Exception persists; appears in exception log |
| 5.3.2 | Update an exception | Changes persist |
| 5.3.3 | Remove an exception | Exception no longer appears |
| 5.3.4 | Fetch exception log | Returns list of active exceptions |

---

### 5.4 Scheduled Runs (implemented — UI side; cron execution is a stub)

| # | Step | Expected |
|---|------|----------|
| 5.4.1 | Fetch scheduled runs for an event | Returns list |
| 5.4.2 | Remove a scheduled run | Run removed from list |
| 5.4.3 | Fetch recent runs | Returns history |
| 5.4.4 | Fetch cron-scheduled runs (`getCronScheduledRuns`) | Returns list from DB |

---

### 5.5 Auto-Grant Execution

> **Status:** Fully implemented. `runGrant` logs the run to `ceuGrantLog`, inserts declined attendees into `ceuDeclined`, and inserts awarded attendees into `ceuAwarded`. `runCronScheduledRuns` iterates a comma-separated `verts` string, runs all due grants per vertical, and advances `ceuGrants.startDate` by the daily/weekly/monthly interval. `createGrant` with `runType = 'once'` triggers `runGrant` immediately after insert.

| # | Step | Expected |
|---|------|----------|
| 5.5.1 | Create a grant with `runType: 'once'` | `ceuGrants` row inserted; `runGrant` executes immediately; `ceuGrantLog` row created; `ceuAwarded`/`ceuDeclined` rows populated |
| 5.5.2 | Create a grant with `runType: 'once'` and `testMode: true` | Only attendee with matching `adminID` is targeted; other attendees not processed |
| 5.5.3 | Create a grant with `runType: 'weekly'` | `ceuGrants` row inserted; `runGrant` NOT called immediately (scheduled only) |
| 5.5.4 | Call `GET /credits/grants` (triggers `runCronScheduledRuns`) | Runs all due scheduled grants for the `verts` header value; advances `startDate` on each processed `ceuGrants` row |
| 5.5.5 | Verify `ceuGrantLog` after cron run | One new row per grant processed, with correct `runDate` |
| 5.5.6 | Verify `ceuGrants.startDate` after cron run | Weekly grant: `startDate` advanced by 7 days; daily: +1 day; monthly: +1 month |
| 5.5.7 | Re-trigger cron before next due date | `getCronScheduledRuns` returns empty (startDate > now); no grants re-run |

---

### 5.6 Transcript Generation (implemented)

| # | Step | Expected |
|---|------|----------|
| 5.6.1 | Fetch transcript template data for an attendee | Returns structured data object |
| 5.6.2 | Render transcript template (EJS) | Returns HTML string |
| 5.6.3 | Access external/unauthenticated transcript URL | Accessible without `cftoken`/`cfid` headers |
| 5.6.4 | Fetch sample transcript data | Returns sample object with expected shape |

---

## 6. Pending Transaction Processing (Cron)

> **Status:** Fully implemented. Polls MSSQL for unconfirmed AuthNet transactions and re-queries AuthNet for their status.

| # | Step | Expected |
|---|------|----------|
| 6.1 | `GET /chron/pending-transactions` (no affiliateID) | Returns list of pending transactions across all affiliates |
| 6.2 | `GET /chron/pending-transactions/:affiliateID` | Returns pending transactions for that affiliate only |
| 6.3 | `POST /chron/pending-transactions` with correct `validationkey` | Iterates pending authnet transactions, calls `getTransactionDetails` for each, returns count processed |
| 6.4 | `POST /chron/pending-transactions` with wrong/missing `validationkey` | Returns `{ status: 'completed' }` without processing (security gate) |
| 6.5 | Confirm no CEU grants are triggered by this endpoint | Cron service only processes payment transactions, not credits |

---

## 7. Cross-Gateway Edge Cases

| # | Scenario | Expected |
|---|----------|----------|
| 7.1 | Affiliate has no gateway configured — attempt any payment endpoint | Returns appropriate error (not 500) |
| 7.2 | `vert` header missing on any payment endpoint | Returns 400 from `requireVertical` middleware |
| 7.3 | Invalid session on any authenticated payment endpoint | Returns 401 |
| 7.4 | `refundAmount` is 0 or negative on AuthNet refund route | Verify API does not forward to gateway |
| 7.5 | `transactionID` with colon prefix (e.g. `Grp%20CkOut:%2042037849794`) | Verify ID is parsed to bare number before gateway call |
| 7.6 | Concurrent refund requests for the same transaction | No distributed lock exists on payment transactions — verify DB does not get duplicate rows |

---

## 8. Pre-Cutover Verification — payment transaction finalization

> **Status: ✅ IMPLEMENTED**
>
> Both `getTransactionDetails` post-response write-back (§8.1) and `updateTransactionsMongo` sync (§8.2) are now fully ported from Mantle (commit 536e23f). These verification steps confirm the implementation works end-to-end before AuthNet cutover.

---

### Implementation Status

| Component | File | Lines | Implementation | Status |
|-----------|------|-------|-----------------|--------|
| getTransactionDetails branching | src/functions/authNet.js | 252–377 | Three branches on transactionStatus: captured/settled, failed/declined, unconfirmed | ✅ Complete |
| updateTransaction MSSQL call | src/functions/authNet.js | 106–126 | Calls `dbo.node_updateTransaction` with all required parameters; then calls updateTransactionsMongo | ✅ Complete |
| updateTransactionsMongo sync | src/functions/authNet.js | 55–100 | Queries MSSQL for transaction sum and list; updates MongoDB `attendees.tr` and `attendees.tp` | ✅ Complete |
| sendUnconfirmedPaymentAlerts | src/functions/paymentTransactions.js | 61–175 | Sends two emails (attendee + event host) via SendGrid; called from getTransactionDetails unconfirmed branch | ✅ Complete |

---

### 8.1 `getTransactionDetails` — post-response write-back verification

Verify that `GetTransactionDetailsResponse` branches correctly and writes to MSSQL + MongoDB.

**Three branches on `transactionStatus`:**

| Branch | Condition | Flow |
|--------|-----------|------|
| Captured / settled | `transactionStatus` ∈ {`capturedpendingsettlement`, `settledsuccessfully`} AND NOT `forceUnconfirmed` AND NOT `refund` | Calls `updateTransaction()` → MSSQL `dbo.node_updateTransaction` → MongoDB sync |
| Failed / declined | `transactionStatus` ∈ {`declined`, `expired`, `generalerror`, `voided`, `failedreview`} AND NOT `forceUnconfirmed` AND NOT `refund` | Calls `updateTransaction()` with `failed=true` → MSSQL → MongoDB (failed transactions not counted in `tp`) |
| Unconfirmed | (`payingnow=true` OR `forceUnconfirmed=true`) AND `response.transaction.order` exists | Calls `sendUnconfirmedPaymentAlerts()` → two SendGrid emails; NO database writes |

**Verification steps:**

| # | Step | Expected |
|---|------|----------|
| 8.1.1 | Create charge with sandbox card via `POST /authnet/pay` (c=12345, amount=$50); call `GET /authnet/transactionDetails/:affiliateID/:transactionID` | MSSQL `contestant_transactions`: new row with `amount=50`, `processID={transactionID}`, `pending=0`, `failed=0`; MongoDB `attendees`: doc with `c: 12345` has `tp >= 50`, `tr` contains transaction |
| 8.1.2 | Create charge with declining test card; call `GET /authnet/transactionDetails/...` with `forceUnconfirmed=false` | MSSQL: new row with `failed=1`, `processIDNew` contains decline reason; MongoDB: `tp` unchanged (failed not counted) |
| 8.1.3 | Create charge with `forceUnconfirmed=true` or `payingnow=true`; call `GET /authnet/transactionDetails/.../...?forceUnconfirmed=true` | Two SendGrid emails sent: (1) to attendee with payment guidance, (2) to event host with reconciliation instructions; MSSQL/MongoDB NOT updated |
| 8.1.4 | Create multiple charges for same attendee (e.g. 54321); check MongoDB after second charge | `attendees` doc: `tp = sum of both charge amounts`, `tr` is array of 2 transactions |

---

### 8.2 `updateTransactionsMongo` — MongoDB sync verification

Verify that MSSQL transaction data is correctly synced to MongoDB after each MSSQL write.

**Process:**

1. Query MSSQL: `SELECT SUM(amount) FROM contestant_transactions WHERE contestant_id = @attendeeID`
2. Query MSSQL: `SELECT amount AS [am], processDate AS [pd], processID AS [pi], processToken AS [ptk], payMethod AS pm FROM contestant_transactions WHERE contestant_id = @attendeeID`
3. Update MongoDB: `{ c: attendeeID, sg: { $exists: false } }` → `{ $set: { tr: [rows], tp: totalPaid }, $currentDate: { lu: { $type: "date" } } }`

**Verification steps:**

| # | Step | Expected |
|---|------|----------|
| 8.2.1 | After test 8.1.1 settles, inspect MongoDB `attendees` for attendeeID 12345 | `tp = 50` (or more if prior transactions); `tr` array has ≥1 entry with `am: 50`, `pd: {date}`, `pi: {transactionID}`, `ptk: {invoiceNumber}`, `pm: "authNet"`; `lu` is current timestamp |
| 8.2.2 | Create second charge for same attendee 12345 ($75); check MongoDB again | `tr` now has 2 entries; `tp = 125` (50 + 75) |
| 8.2.3 | Verify test 8.1.2 (declined charge) does NOT update MongoDB | For declined transaction attendee: `tp` and `tr` unchanged from before charge attempt |
| 8.2.4 | Inline cross-check: Run MSSQL `SELECT SUM(amount) FROM contestant_transactions WHERE contestant_id = 12345` | Result equals MongoDB `attendees.tp` for that attendee exactly |

---



| Gateway | Charge | Refund | Void | Notes |
|---------|--------|--------|------|-------|
| **Authorize.Net** | ✅ Implemented | ✅ Implemented | ✅ Implemented | Highest confidence — recently migrated from Mantle |
| **Vantiv/Worldpay** | ✅ Implemented | ✅ Implemented | ⛔ Not present | Real gateway calls via cert endpoint; recordRefund wired; no void path (gateway does not have a pending-settlement concept like AuthNet) |
| **Stripe** | ⛔ Not present | ⛔ Not present | ⛔ Not present | Webhook logging only; payment is client-side |
| **PayZang** | ⛔ Not present | ⛔ Not present | ⛔ Not present | Config fields only; no service/routes |
| **CEU Auto-Grant** | — | — | — | Infrastructure implemented; cron execution path is a stub |
