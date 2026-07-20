# CLAUDE.md — EventSquid Private API

This file provides guidance for AI coding assistants working in this repository.

---

## Project Overview

EventSquid Private API is a **Node.js 24 serverless application** running on **AWS Lambda** behind **API Gateway**. It serves as the backend for the EventSquid platform and several related verticals (Connect, FitSquid, InReach, RCFlightDeck, KinderTales, LaunchSquid).

- **Entry point (Lambda)**: `src/handler.js`
- **Entry point (local dev)**: `local-server.js` (Express on port 3000)
- **Route registry**: `src/routes/index.js` (247+ routes)
- **Full architecture**: `docs/ARCHITECTURE.md`

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24.x, ES Modules (`"type": "module"`) |
| Compute | AWS Lambda (1024 MB, 120s timeout) |
| API | AWS API Gateway (REST API) |
| Primary DB | MongoDB Atlas (native driver v6) |
| Secondary DB | MSSQL (SQL Server via `mssql` v10 / `tedious`) |
| Email | SendGrid (`@sendgrid/mail`) |
| SMS | Twilio |
| Payments | Authorize.Net (active), Vantiv/Worldpay, Stripe, PayZang (stubs) |
| File storage | AWS S3 (two buckets: `eventsquid`, `eventsquid-private`) |
| Secrets | AWS Secrets Manager |
| Notifications | AWS SNS |
| IaC | AWS CloudFormation (`cloudformation/template.yaml`) |
| CI/CD | AWS CodePipeline + CodeBuild (`cloudformation/pipeline.yaml`) |

---

## Multi-Vertical Pattern

Every request carries a `vert` header (e.g., `es`, `cn`, `ft`). This identifier maps to both the MongoDB database and the MSSQL database used for that request.

```
vert: es → MongoDB: eventsquid      / MSSQL: eventsquid
vert: cn → MongoDB: connect         / MSSQL: connect
vert: ft → MongoDB: fitsquid        / MSSQL: fitsquid
vert: ir → MongoDB: inreach         / MSSQL: inreach
vert: fd → MongoDB: rcflightdeck    / MSSQL: rcflightdeck
vert: kt → MongoDB: kindertales     / MSSQL: kindertales
vert: ln → MongoDB: launchsquid     / MSSQL: launchsquid
```

Always pass a valid `vert` when working with routes that require a vertical. Middleware validation is in `src/middleware/verticalCheck.js`.

---

## Authentication

Three methods are supported. See `docs/AUTHENTICATION.md` for full details.

1. **Session auth** (primary) — headers `cftoken` + `cfid`. Validated against MongoDB `cm.cfsessions`.
2. **Dev token** — header `devtoken`. For testing only; validated against MongoDB `cm.dev-keys`.
3. **Cron run** — header `cronrun`. No validation; used for scheduled jobs.

Public routes (no auth required): `GET /health`, `GET /qr/*`, `GET /download/:fileID`, `POST /verification/verify`.

---

## Route Structure

Each route module in `src/routes/` exports an array of route objects:

```javascript
export default [
  {
    method: 'GET',            // GET | POST | PUT | DELETE | ANY
    path: '/resource/:id',
    handler: async (request) => {
      // request.pathParameters, .queryStringParameters, .body, .headers, .session
      return { statusCode: 200, body: { ... } };
    }
  }
];
```

All modules are registered in `src/routes/index.js`. When adding a new route, add it there.

---

## Service Layer

Business logic lives in `src/services/`. Services receive DB connections and request data; they do not parse HTTP directly. Key services:

- `EventService.js` — event CRUD, ICS generation, config
- `AttendeeService.js` — attendee queries, pivot tables
- `AgendaService.js` — session slots, agenda data
- `PaymentService.js` / `AuthNetService.js` — payment processing
- `EmailService.js` / `sendgridConfig.js` — SendGrid integration
- `CreditsService.js` — CEU/credit tracking

---

## Database Access

Use the helpers in `src/utils/`:

```javascript
import { getMongoClient } from '../utils/mongodb.js';
import { getMssqlPool } from '../utils/mssql.js';
```

Both cache connections per Lambda container. For deployed code, credentials are fetched from Secrets Manager once and cached. Locally, credentials come from `.env`.

### Event-Level Locking

For operations that must be atomic on an event, use `withEventMongoLock` from `src/utils/eventTouchMongo.js`. This is the existing concurrency mechanism for events — do not bypass it.

---

## Secrets & Config

| Secret Name (Secrets Manager) | Contents |
|-------------------------------|----------|
| `mongodb/eventsquid` | MongoDB Atlas connection string |
| `primary-mssql/event-squid` | MSSQL credentials |
| `sendgrid/api-credentials` | SendGrid API keys |
| `twilio/api-credentials` | Twilio SID, auth token, messaging service SID |
| `timezonedb/*` | TimezoneDB API key |

Locally, these are overridden by `.env` (never commit `.env` to git — it is in `.gitignore`).

---

## Local Development

```bash
npm install
cp .env.example .env   # fill in local credentials
npm run dev            # starts Express on :3000
```

The local server (`local-server.js`) converts Express requests into API Gateway event format and calls the Lambda handler in-process. It faithfully simulates the Lambda environment including body encoding variants.

**Known issue**: `mssql`/`tedious` emits `createSecurePair` deprecation errors on Node 24. These are suppressed in `local-server.js`. MSSQL connections will still work for most operations.

---

## Deployment

### Manual (quick update)

```powershell
# Windows
.\scripts\deploy.ps1

# Bash
./scripts/deploy.sh
```

### CloudFormation (infrastructure + code)

```bash
aws cloudformation deploy \
  --template-file cloudformation/template.yaml \
  --stack-name eventsquid-private-api \
  --parameter-overrides VpcId=vpc-xxx SubnetIds=subnet-a,subnet-b \
  --capabilities CAPABILITY_NAMED_IAM
```

### CI/CD Pipeline

Pushes to the `main` branch trigger CodePipeline automatically (defined in `cloudformation/pipeline.yaml`). The `dev` stage always tracks `$LATEST`; the `v1` stage tracks a published Lambda version alias (`live`).

### Pre-Deploy Import Check

**Before every deploy, verify all imports resolve** by running Node's module loader in dry-run mode:

```bash
node --input-type=module <<'EOF'
import './src/handler.js';
EOF
```

This catches `SyntaxError: does not provide an export named '...'` and missing-module errors at the entry point before the package is uploaded to Lambda. A clean run produces no output. Any import error will be printed and exit non-zero.

Common mistakes to watch for when writing new code:
- Importing a **method on a class** as if it were a standalone export (e.g. `getEventDataByGUID` lives on `EventService`, not `functions/events.js`)
- Importing a **named export from `mssql` directly** — `TYPES` and other mssql internals are re-exported via `src/utils/mssql.js`; always import from there
- Adding a new file and forgetting to `export` the function at all

---

## Code Conventions

- **ES Modules only** — use `import`/`export`, never `require()`
- **Async/await** — no raw Promise chains
- **Response helpers** — use `src/utils/response.js` for consistent HTTP responses
- **No request body validation library** — each service validates its own inputs
- **Error reporting** — 5xx responses automatically publish to the SNS error topic
- **Debug logging** — `console.log` debug statements exist in several services; do not add new ones without removing them before merging

---

## Known Issues & Incomplete Areas

| Area | Status | Notes |
|------|--------|-------|
| Payment gateways | Partial | Authorize.Net and Vantiv/Worldpay are implemented (charge, refund, void where applicable). Stripe is webhook-logging only by design (charges are client-side via the Stripe SDK). PayZang has config fields only — no service or routes. |
| Unit / integration tests | None | `npm test` has no test files yet |
| Debug logs | Present | Several services emit verbose debug `console.log` lines |
| CORS | Open (`*`) | Intended for API-first usage; restrict in production if SPA-only |

---

## File Map (Quick Reference)

```
src/
  handler.js              Lambda entry point, routing, body parsing
  routes/index.js         Route registry (all 247+ routes)
  routes/*.js             Route modules (one per domain)
  services/*.js           Business logic
  functions/*.js          Standalone helper functions
  middleware/
    auth.js               Authentication middleware
    verticalCheck.js      Vertical header validation
  utils/
    mongodb.js            MongoDB connection + helpers
    mssql.js              MSSQL connection + helpers
    response.js           HTTP response builders
    s3.js                 S3 read/write/delete/presign
    sns.js                SNS error publishing
    twilioConfig.js       Twilio credential resolution
    sendgridConfig.js     SendGrid credential resolution
    eventTouchMongo.js    Event-level distributed lock
cloudformation/
  template.yaml           Lambda, API GW, IAM, SNS, CloudWatch
  pipeline.yaml           CodePipeline + CodeBuild CI/CD
scripts/
  deploy.sh / deploy.ps1  Manual Lambda code update
  setup-secrets.sh        Secrets Manager helper
docs/
  ARCHITECTURE.md         Full system architecture
  AUTHENTICATION.md       Auth method details
  S3_AND_VPC.md           S3 bucket and VPC setup
  PIPELINE_MIGRATION.md   CI/CD pipeline notes
```
