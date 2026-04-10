# Architecture — EventSquid Private API

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [AWS Infrastructure](#3-aws-infrastructure)
4. [Request Lifecycle](#4-request-lifecycle)
5. [API Structure](#5-api-structure)
6. [Multi-Vertical Pattern](#6-multi-vertical-pattern)
7. [Data Layer](#7-data-layer)
8. [External Integrations](#8-external-integrations)
9. [Authentication & Authorization](#9-authentication--authorization)
10. [Configuration & Secrets](#10-configuration--secrets)
11. [Build & Deployment](#11-build--deployment)
12. [Known Issues & Risks](#12-known-issues--risks)

---

## 1. System Overview

EventSquid Private API is a **multi-tenant, multi-vertical serverless REST API**. It serves as the backend for the EventSquid event management platform and a family of related SaaS products (verticals). All verticals share the same Lambda deployment; tenant isolation is achieved through the `vert` header, which selects the corresponding database.

```
Client (SPA / Mobile)
        │  HTTPS
        ▼
   API Gateway (REST)
    ├── /dev  → Lambda :dev alias ($LATEST)
    └── /v1   → Lambda :live alias (published version)
        │
        ▼
   Lambda Function
   eventsquid-private-api
   (Node.js 24, 1024 MB, 120 s, VPC)
        │
        ├── MongoDB Atlas (primary store)
        ├── MSSQL / SQL Server (cross-vertical data)
        ├── S3 (file storage)
        ├── Secrets Manager (credentials)
        └── SNS (error notifications)
```

---

## 2. Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 24.x |
| Module system | ES Modules (`type: "module"`) | — |
| Serverless compute | AWS Lambda | nodejs24.x runtime |
| API gateway | AWS API Gateway | REST API |
| Primary database | MongoDB Atlas | driver v6.10.0 |
| Secondary database | Microsoft SQL Server | mssql v10.0.0 |
| Email | SendGrid | @sendgrid/mail v8.1.3 |
| SMS / voice | Twilio | twilio v5.3.5 |
| Payment processing | Authorize.Net | authorizenet v1.0.7 |
| File storage | AWS S3 | AWS SDK v3 |
| Secrets | AWS Secrets Manager | AWS SDK v3 |
| Notifications | AWS SNS | AWS SDK v3 |
| QR codes | qr-image | v3.2.0 |
| Calendar export | @touch4it/ical-timezones | v1.5.0 |
| HTML templates | EJS | v3.1.10 |
| Date/timezone | Moment.js + moment-timezone | 2.30.1 / 0.5.45 |
| Utility | Lodash | 4.17.21 |
| HTTP client | axios | 1.7.9 |
| IaC | AWS CloudFormation | — |
| CI/CD | AWS CodePipeline + CodeBuild | — |
| Local dev server | Express.js (devDependency) | 4.18.2 |

---

## 3. AWS Infrastructure

All infrastructure is defined in `cloudformation/template.yaml`.

### Lambda Function

| Setting | Value |
|---------|-------|
| Function name | `eventsquid-private-api` |
| Runtime | nodejs24.x |
| Memory | 1024 MB |
| Timeout | 300 seconds |
| Reserved concurrency | 150 |
| VPC | Yes — subnet `subnet-3a650c62` (us-west-2c); security groups `sg-277a3b5e`, `sg-d087f8ac` |
| Region | us-west-2 |

The Lambda runs inside a VPC to allow private access to MSSQL/Redis resources and to route outbound internet traffic (Twilio, SendGrid) through a NAT Gateway with a fixed Elastic IP. It uses two Lambda aliases:
- `:dev` → always `$LATEST` (development endpoint)
- `:live` → published version (production endpoint)

### API Gateway

- Type: REST API (not HTTP API)
- Routes: `ANY /` and `ANY /{proxy+}` (catch-all)
- Stages: `dev` (alias `dev`) and `v1` (alias `live`)
- Throttling: 100 burst / 50 req/sec per stage
- Auth: None at gateway level — auth is handled inside Lambda

### S3 Buckets

| Bucket | Access | Usage |
|--------|--------|-------|
| `eventsquid` | Public-readable | Event images, documents, resources |
| `eventsquid-private` | Private (presigned URLs) | Exports, reports, sensitive files |

The Lambda IAM role has `PutObject`, `GetObject`, `DeleteObject`, `GetObjectVersion`, and `ListBucket` on both buckets. Presigned URLs default to 15-minute expiry.

### Secrets Manager

| Secret Name | Contents |
|-------------|----------|
| `mongodb/eventsquid` | MongoDB Atlas connection string |
| `primary-mssql/event-squid` | MSSQL host, user, password, database |
| `sendgrid/api-credentials` | SendGrid API keys |
| `twilio/api-credentials` | Twilio account SID, auth token, messaging service SID |
| `timezonedb/*` | TimezoneDB API key |

### SNS

- Topic: `eventsquid-private-api-errors`
- Triggers: Any Lambda handler returning a 5xx status code
- Optional email subscription via CloudFormation `ErrorNotificationEmail` parameter

### CloudWatch Logs

- Log group: `/aws/lambda/eventsquid-private-api`
- Recommended retention: 14 days (not enforced in template by default)

### VPC Networking

The Lambda VPC configuration was updated to enable outbound internet access for third-party API calls (Twilio, SendGrid, TimezoneDB).

**NAT Gateway**

| Field | Value |
|-------|-------|
| Name | `eventsquid-nat-gateway` |
| ID | `nat-079e65dddd1f49b60` |
| Elastic IP | `52.42.35.237` (static — safe to allowlist at third-party APIs) |
| Availability zone | us-west-2a (`subnet-3c625f4a`) |

**Route tables**

| Route table | ID | Default route | Used by |
|-------------|-----|---------------|---------|
| `rtb-lambda-private` | `rtb-05efe24d2917744a3` | `0.0.0.0/0 → eventsquid-nat-gateway` | Lambda (`subnet-3a650c62`, us-west-2c) |
| `rtb-dca92ebb` | `rtb-dca92ebb` | Direct IGW | CF servers and other EC2 instances — unaffected |

**Lambda subnet**

The Lambda is configured to use only `subnet-3a650c62` (us-west-2c), which is associated with `rtb-lambda-private`. This gives Lambda:
- Private access to MSSQL/Redis (via VPC-internal routing)
- Outbound internet access via NAT Gateway for Twilio, SendGrid, TimezoneDB, and AuthNet calls
- A fixed source IP (`52.42.35.237`) that can be allowlisted in external services

> **Note:** The CloudFormation template `SubnetIds` parameter should be updated to `subnet-3a650c62` only if the stack is ever redeployed. The Lambda VPC config was updated directly in AWS.

### IAM Role

The Lambda execution role (`eventsquid-private-api-lambda-role`) is granted:
- `secretsmanager:GetSecretValue`, `DescribeSecret`
- `s3:PutObject`, `GetObject`, `DeleteObject`, `GetObjectVersion`, `ListBucket` on both S3 buckets
- `sns:Publish` on the error topic
- `logs:CreateLogGroup`, `CreateLogStream`, `PutLogEvents`
- `ec2:CreateNetworkInterface`, `DescribeNetworkInterfaces`, `DeleteNetworkInterface` (VPC access)

---

## 4. Request Lifecycle

```
1. Client sends HTTP request to API Gateway
2. API Gateway proxies the full event to Lambda (proxy integration)
3. src/handler.js receives the Lambda event
4. Handler normalizes the event:
   - Lowercases all header keys
   - Parses the body (JSON → base64 → form-url-encoded → byte array)
   - Extracts method, path, query params, path params
5. Handler runs authentication middleware (src/middleware/auth.js)
   - Validates cftoken/cfid against MongoDB cm.cfsessions
   - Attaches session to request object
6. Handler matches route from src/routes/index.js
   - Exact path match first, then parameterized match (:param segments)
7. Route handler is called with normalized request object
8. Route handler calls service(s) → database(s) / external API(s)
9. Handler returns { statusCode, headers, body } to API Gateway
10. On 5xx: publishes error message to SNS topic
11. API Gateway returns response to client
```

### Request Object Shape

```javascript
{
  method: 'GET' | 'POST' | ...,
  path: '/resource/123',
  pathParameters: { id: '123' },
  queryStringParameters: { key: 'value' },
  body: Object | string | null,
  headers: { 'content-type': '...', 'cftoken': '...', 'vert': 'es' },
  session: { /* populated by auth middleware */ },
  event: { /* raw Lambda event */ }
}
```

### Response Object Shape

```javascript
{
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: '{ "data": ... }',   // JSON stringified
  isBase64Encoded: false      // true for binary responses (QR codes, files)
}
```

---

## 5. API Structure

### Directory Layout

```
src/
  handler.js              Lambda entry point — routing, auth, body parsing
  routes/
    index.js              Registers all route modules (247+ routes)
    events.js             Event CRUD, ICS, CEU config
    attendees.js          Attendee queries and updates
    agenda.js             Session slots, sponsor binding
    payment.js            Payment gateway configuration
    authNet.js            Authorize.Net transactions
    email.js              SendGrid send/validate/track
    sms.js                Twilio send/status callbacks
    veo.js                VEO scheduling integration
    qr.js                 QR code generation (public)
    reports.js            Reporting and exports
    credits.js            CEU/credit categories and awards
    invitations.js        Invitation management
    sponsors.js           Sponsor CRUD and resources
    tableAssigner.js      Table assignment and seating
    checkInApp.js         Check-in app preferences
    contactScanApp.js     Contact scan app config
    regitems.js           Registration fees and items
    download.js           File download proxy
    chron.js              Cron/scheduled job triggers
    ... (18 more modules)
  services/               Business logic (one class per domain)
  functions/              Standalone helper functions
  middleware/
    auth.js               Session/devtoken/cronrun auth
    verticalCheck.js      vert header validation
  utils/
    mongodb.js            Connection pool + helpers
    mssql.js              Connection pool + helpers
    response.js           HTTP response builders
    s3.js                 S3 operations
    sns.js                SNS publish
    twilioConfig.js       Twilio credential resolution
    sendgridConfig.js     SendGrid credential resolution
    eventTouchMongo.js    Event-level distributed lock
```

### Route Categories

| Category | Route Count | Module(s) |
|----------|-------------|-----------|
| Events | 38 | `events.js` |
| Sponsors | 15 | `sponsors.js` |
| Payments | 15+ | `payment.js`, `authNet.js`, `vantivWorldpay.js`, `stripe.js` |
| Reporting | 12 | `reports.js` |
| Email | 12 | `email.js` |
| Credits / CEU | 10 | `credits.js` |
| VEO scheduling | 10 | `veo.js` |
| Registration items | 8 | `regitems.js` |
| Agenda / slots | 8 | `agenda.js` |
| Table assigner | 8 | `tableAssigner.js` |
| Invitations | 7 | `invitations.js` |
| Affiliates | 6 | `affiliate.js` |
| Attendees | 9 | `attendees.js` |
| SMS | 4 | `sms.js` |
| QR codes | 3 | `qr.js` |
| Contact scan app | 3 | `contactScanApp.js` |
| Activity / changes | 3 | `activity.js`, `changes.js` |
| Downloads | 1 | `download.js` |
| Health | 1 | root handler |
| Other | 20+ | misc modules |

### CORS

- `Access-Control-Allow-Origin: *`
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
- Allowed headers: Content-Type, Authorization, X-Amz-Date, X-Api-Key, cftoken, cfid, vert, s3domain
- OPTIONS preflight is handled globally in `handler.js`

---

## 6. Multi-Vertical Pattern

The `vert` request header selects the database for each request. This is the core multi-tenancy mechanism.

### Vertical Map

| `vert` | Product | MongoDB DB | MSSQL DB |
|--------|---------|------------|----------|
| `es` | EventSquid | `eventsquid` | `eventsquid` |
| `cn` | Connect | `connect` | `connect` |
| `ft` | FitSquid | `fitsquid` | `fitsquid` |
| `ir` | InReach | `inreach` | `inreach` |
| `fd` | RCFlightDeck | `rcflightdeck` | `rcflightdeck` |
| `kt` | KinderTales | `kindertales` | `kindertales` |
| `ln` | LaunchSquid | `launchsquid` | `launchsquid` |

Shared auth data (sessions, users) lives in the `cm` (common) MongoDB database regardless of vertical.

### Validation

`src/middleware/verticalCheck.js` validates the `vert` header before routes run. Invalid verticals return 400.

---

## 7. Data Layer

### MongoDB (Primary)

- Driver: `mongodb` v6.10.0 (native, not Mongoose)
- Connection: Singleton client cached per Lambda container
- Credentials: Secrets Manager → `MONGO_CONNECTION_STRING` env var (local)
- Multi-vertical: separate connection strings per vertical (common string from `MONGO_COMMON_CONNECTION_STRING`)

**Key databases and collections:**

| Database | Collections (examples) |
|----------|----------------------|
| `eventsquid` (per-vertical) | events, attendees, registrations, agenda_slots, sponsors, invitations, payment_transactions |
| `cm` (common/auth) | cfsessions, dev-keys, users, affiliates |

**Schema conventions (abbreviated):**
```javascript
// Event document (heavily abbreviated)
{
  _id: ObjectId,
  e: string,         // event name
  et: string,        // event type
  a: ObjectId,       // affiliate ID
  an: string,        // affiliate name
  pfs: { ... },      // fees config
  evfs: [ ... ],     // event fees array
}

// Session document (cm.cfsessions)
{
  _id: 'affiliateId_userId_tokenPart',
  user_id: ObjectId,
  affiliate_id: ObjectId,
  vertical: string,
}
```

**Event locking:** `src/utils/eventTouchMongo.js` provides a `withEventMongoLock(eventId, fn)` wrapper for operations that must be serialized per event (e.g., registration writes). This is the only distributed lock in the system.

### MSSQL (Secondary)

- Driver: `mssql` v10.0.0 (uses `tedious` internally)
- Connection: Pool of up to 10 connections, cached per Lambda container
- Credentials: Secrets Manager → `MSSQL_CONNECTION_STRING` env var (local)
- Used for: cross-vertical data, certain reporting queries, legacy tables

**Key tables (examples):**

| Table | Purpose |
|-------|---------|
| `b_events` | Event definitions |
| `b_event_fees` | Fee schedules |
| `b_registrations` | Attendee registrations |
| `b_agenda_slots` | Agenda/session slots |
| `b_users` | User accounts |
| `contactScanAppAPI` | Mobile app API fields |

All MSSQL queries use parameterized inputs (`sql.Request().input()`) to prevent SQL injection. Database selection uses `USE ${dbName}` where `dbName` is resolved from the vertical map (not user-supplied directly).

### S3 (File Storage)

Operations via `src/utils/s3.js`:
- **Upload**: base64 or Buffer → S3 PutObject
- **Download**: S3 GetObject → base64 encode for Lambda response
- **Delete**: S3 DeleteObject (with version support)
- **Presign**: Generate temporary GET URLs (default 15-minute expiry)
- **Copy**: CopyObject between paths/buckets

Files are loaded into Lambda memory as base64. The 1024 MB Lambda memory cap limits practical upload size.

---

## 8. External Integrations

### SendGrid (Email)

- Package: `@sendgrid/mail` v8.1.3
- Credentials: Secrets Manager `sendgrid/api-credentials`; config utility: `src/utils/sendgridConfig.js`

| Credential | Purpose |
|------------|---------|
| `SG_API_KEY` / `SENDGRID_API_KEY` | Send emails |
| `SG_EMAIL_VAL_KEY` | Email address validation API |
| `SG_EMAIL_ACTIVITY_KEY` | Email activity/status API |
| `SENDGRID_INBOUND_API_KEY` | Webhook signature validation |

**Routes:**
- `POST /email/send` — send email
- `POST /email/validate` — validate address
- `POST /email/verify` — send verification code
- `GET /email/find-by-status/:status` — query send logs
- `GET /email/find-by-type/:type` — query by type

### Twilio (SMS)

- Package: `twilio` v5.3.5
- Credentials: Secrets Manager `twilio/api-credentials`; config utility: `src/utils/twilioConfig.js`

| Credential | Purpose |
|------------|---------|
| `TWILIO_ACCT_SID` | Account identifier |
| `TWILIO_AUTH_TOKEN` | API auth token |
| `TWILIO_MSG_SERVICE_SID` | Messaging service |
| `TWILIO_STATUS_CALLBACK` | Webhook path for delivery status |
| `TWILIO_INBOUND_API_KEY` | Webhook validation key |

**Routes:**
- `POST /sms/send` — send SMS
- `POST /sms/log-twilio-status` — Twilio delivery callback
- `POST /sms/verify-code` — send OTP
- `GET /sms/find/:messageID` — look up message status

### Authorize.Net (Payment Processing)

- Package: `authorizenet` v1.0.7
- Credentials: per-event gateway config stored in MongoDB

**Routes:**
- `POST /authnet/pay-by-card` — charge a card
- `GET /authnet/transaction/:transactionID` — get transaction
- `POST /authnet/refund` — issue refund
- `POST /authnet/public-key/:attendeeGUID` — client-side public key
- `POST /authnet/form` — hosted payment form

**Status:** Functional for charges. Refund/void functions have TODO stubs in `src/functions/authNet.js`.

### Vantiv/Worldpay, Stripe, PayZang (Payment — Stub)

Routes exist but service implementations are mostly placeholder stubs. Not production-ready.

### TimezoneDB

- Credentials: Secrets Manager; utility: `src/utils/timezonedbApiKey.js`
- Purpose: Timezone resolution for event scheduling

### QR Code Generation

- Package: `qr-image` v3.2.0
- Output: PNG or SVG returned as base64 binary Lambda response
- Routes: `GET /qr/mobileAttendeeQR/:vert/:attendeeGUID`, etc. (public, no auth)

### iCalendar Export

- Package: `@touch4it/ical-timezones` v1.5.0
- Routes: `GET /events/generate-ics/:eventID`, `GET /events/generate-fee-ics/:eventID`
- Output: `.ics` file with timezone VTIMEZONE components

### EJS Templates

- Package: `ejs` v3.1.10
- Usage: CEU transcript PDF-ready HTML (`templates/ceu-transcript.ejs`)

---

## 9. Authentication & Authorization

See `docs/AUTHENTICATION.md` for detailed documentation.

### Methods

| Method | Headers | Validation Source | Notes |
|--------|---------|-------------------|-------|
| Session | `cftoken` + `cfid` | MongoDB `cm.cfsessions` | Primary method |
| Dev token | `devtoken` | MongoDB `cm.dev-keys` | Testing only |
| Cron run | `cronrun` | None | Scheduled jobs only |

### Public Routes (no auth)

- `GET /health`
- `GET /qr/*`
- `GET /download/:fileID`
- `POST /verification/verify`

### Session Token Format

The `cftoken` header follows the pattern `affiliateId_userId_tokenPart`. The `cfid` header identifies the affiliate. Together they form the session lookup key in `cm.cfsessions`.

---

## 10. Configuration & Secrets

### Deployed (Lambda)

Credentials are fetched from AWS Secrets Manager at runtime. Each utility module (`mongodb.js`, `twilioConfig.js`, `sendgridConfig.js`) caches its secret value for the lifetime of the Lambda container.

Environment variables set on the Lambda function:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `dev` or `v1` (set by CodeBuild per branch) |
| `ERROR_SNS_TOPIC_ARN` | ARN of the SNS error topic |
| `AWS_REGION` | `us-west-2` |

### Local Development

Credentials come from `.env` (not committed). The `.env` file should set:

```
NODE_ENV=development
AWS_REGION=us-west-2
AWS_PROFILE=eventsquid
MONGO_CONNECTION_STRING=mongodb+srv://...
MONGO_COMMON_CONNECTION_STRING=mongodb+srv://...
TWILIO_ACCT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_INBOUND_API_KEY=...
TWILIO_STATUS_CALLBACK=/sms/twilio-status
TWILIO_MSG_SERVICE_SID=...
SG_API_KEY=...
SG_EMAIL_VAL_KEY=...
SG_EMAIL_ACTIVITY_KEY=...
```

---

## 11. Build & Deployment

### Local Dev

```bash
npm run dev        # starts local-server.js (Express on :3000)
npm run lint       # ESLint
npm run package    # creates function.zip
```

### Manual Lambda Update

```powershell
# Windows
.\scripts\deploy.ps1

# Bash / macOS
./scripts/deploy.sh
```

Both scripts: install prod dependencies → zip → `aws lambda update-function-code` → wait.

### CloudFormation (first-time or infra change)

```bash
aws cloudformation create-stack \
  --stack-name eventsquid-private-api \
  --template-body file://cloudformation/template.yaml \
  --parameters ParameterKey=VpcId,ParameterValue=vpc-xxx \
               ParameterKey=SubnetIds,ParameterValue=subnet-a\\,subnet-b \
  --capabilities CAPABILITY_NAMED_IAM
```

### CI/CD Pipeline

Defined in `cloudformation/pipeline.yaml`.

```
GitHub push → CodePipeline trigger
  └── CodeBuild
        1. npm ci
        2. npm install --production
        3. zip function.zip
        4. aws cloudformation deploy (infra)
        5. aws lambda update-function-code
        6. aws lambda wait function-updated
        7. (prod only) publish version + update :live alias
```

- `develop` branch → deploys to `dev` stage (`:dev` alias → `$LATEST`)
- `main` branch → deploys to `v1` stage (`:live` alias → published version)

---

## 12. Known Issues & Risks

### Critical

| # | Issue | Severity | Launch Status | File | Remediation |
|---|-------|----------|---------------|------|-------------|
| 1 | `.env` may contain real credentials — never commit it | **Critical** | Required | `.env` | Store all secrets in Secrets Manager; use `.env.example` with placeholders |

### High

| # | Issue | Severity | Launch Status | Notes |
|---|-------|----------|---------------|-------|
| 2 | `tedious`/`mssql` emits `createSecurePair` errors on Node 24 | High | Won't Fix | Dead code removed; suppression was already no-op on tedious 16.7.1 |
| 3 | No unit or integration tests | High | Won't Fix | Codebase is being sunset; tests intentionally deferred |

### Medium

| # | Issue | Severity | Launch Status | Notes |
|---|-------|----------|---------------|-------|
| 4 | ~~Payment gateway stubs (Vantiv/Stripe/PayZang)~~ | — | Resolved | Vantiv/Worldpay fully implemented. Stripe is webhook-log only by design. PayZang config-only — no Mantle implementation to migrate. |
| 5 | ~~`CreditsService.runGrant()` not implemented~~ | — | Resolved | `runGrant`, `runCronScheduledRuns`, and `createGrant` trigger all implemented. |
| 6 | ~~VEO `userRegisteredForEvent` middleware TODO~~ | — | Resolved | `src/middleware/registeredForEvent.js` implemented and wired into `getConfigDataRoute`. |
| 7 | ~~Debug `console.log` statements in services~~ | — | Resolved | Swept: removed debug logs from `handler.js`, `authNet.js`, `sendgrid.js`, `AuthService`, `AttendeeService`, `TableAssignerService`, `affiliate.js`, `routes/reports.js`, `routes/root.js`. Cold-start connection logs in `mongodb.js`/`mssql.js` retained (fire once per container, useful for Lambda diagnostics). |
| 8 | No concurrency lock outside of events | Medium | Post Launch | Attendees, sponsors, etc. have no distributed lock — race conditions possible |
| 9 | CORS `Access-Control-Allow-Origin: *` | Medium | Post Launch | Restrict to known origins if this API is not fully public |
| 10 | No per-user API rate limiting | Medium | Post Launch | Gateway throttles globally at 50 req/sec; no per-client limit |
| 11 | ~~Lambda reserved concurrency = 10~~ | — | Resolved | Set to 150 — sized for registration spikes of 600–1,000 concurrent users |
| 12 | ~~Lambda timeout = 120 s~~ | — | Resolved | Increased to 300 s |
| 13 | No Dead Letter Queue | Medium | Won't Fix | Fire-and-forget was also the pattern in Mantle. SNS alerting on 5xx provides sufficient visibility. |
| 14 | ~~Secrets Manager fetch not cached for MongoDB/MSSQL~~ | — | Resolved | `cm` path now uses `cmConnectionString` + `cmConnectionPromise` deduplication. |
| 15 | No request body schema validation | Medium | Post Launch | Each service validates independently and inconsistently |
| 16 | S3 files loaded entirely into Lambda memory | Medium | Post Launch | Large files will exceed 1024 MB Lambda memory |
| 17 | Body parsing logic is 74 lines in handler | Low | Post Launch | Should be extracted to `src/utils/bodyParser.js` |

### Low

| # | Issue | Severity | Launch Status | Notes |
|---|-------|----------|---------------|-------|
| 18 | `ROUTE_ANALYSIS.md` / Postman collection may be stale | Low | Post Launch | Generated artifacts that can drift from code |
| 19 | `moment.js` is deprecated | Low | Won't Fix | No active maintenance; codebase being sunset — not worth the migration risk |
| 20 | Error responses mix `throw` and `return errorResponse()` | Low | Post Launch | Inconsistent error response format |
