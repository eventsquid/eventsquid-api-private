# Authentication Guide

## Overview

The EventSquid API uses session-based authentication. Most endpoints require authentication, but some public endpoints (like QR code generation) do not.

## Authentication Methods

### 1. Session Authentication (Primary Method)

**Headers Required:**
- `cftoken`: Session token
- `cfid`: Session ID

**How it works:**
- The API combines `cfid` and `cftoken` as `${cfid}_${cftoken}` to look up the session in MongoDB
- Sessions are stored in the `cfsessions` collection in the `cm` (common) database
- If the session is found and valid, the request is authenticated
- The session object is attached to the request as `request.session`

**Example:**
```http
GET /event/123
cftoken: abc123def456
cfid: session_789
```

### 2. Dev Token Authentication (Development/Testing)

**Header Required:**
- `devtoken`: Development token (MongoDB ObjectId or string)

**How it works:**
- Validates the token against the `dev-keys` collection in the `cm` database
- Used for development and testing purposes
- Does not provide a user session, but allows access to protected endpoints

**Example:**
```http
GET /event/123
devtoken: 507f1f77bcf86cd799439011
```

### 3. Cron Run Authentication

**Header Required:**
- `cronrun`: Any value (presence is checked)

**How it works:**
- Used for scheduled/cron job executions
- Does not require a valid session
- Typically used for background tasks

**Example:**
```http
POST /credits/cron/scheduledRuns
cronrun: true
```

## Public Endpoints (No Authentication Required)

The following endpoints do not require authentication:

- `GET /health` - Health check
- `GET /qr/mobileAttendeeQR/:vert/:attendeeGUID` - Generate attendee QR code
- `GET /qr/mobileSpecQR/:vert/:orderGUID` - Generate spectator QR code
- `GET /qr/checkinSpectator/:vert/:orderGUID/:ticketItemGUID` - Generate check-in QR code
- `GET /download/:fileID` - Download files
- `POST /verification/verify` - Verify verification code

## Getting Session Tokens

Session tokens are typically obtained through the main EventSquid application login process. The tokens are stored in browser cookies and sent as headers in API requests.

For testing purposes, you can:
1. Use a dev token (if configured in your database)
2. Log in through the web application and capture the `cftoken` and `cfid` from browser cookies/headers
3. Use browser developer tools to inspect network requests and copy the headers

## Postman Setup

1. **Set Collection Variables:**
   - `baseUrl`: `https://rx8dxmccg2.execute-api.us-west-2.amazonaws.com/dev`
   - `cftoken`: Your session token
   - `cfid`: Your session ID
   - `devtoken`: Your dev token (if using dev token auth)
   - `eventID`: Default event ID for testing
   - `vert`: Vertical identifier (e.g., "es")

2. **For Session Authentication:**
   - Add headers `cftoken` and `cfid` to each request
   - Or set them at the collection/folder level

3. **For Dev Token Authentication:**
   - Add header `devtoken` to each request
   - Remove `cftoken` and `cfid` headers

## Error Responses

**401 Unauthorized:**
- `Invalid Session` - Session token is invalid or expired
- `Invalid Dev Token` - Dev token is invalid
- `Could not construct session identifier` - No authentication headers provided

**403 Forbidden:**
- `Unauthorized: Cannot update avatar for another user` - User doesn't have permission

## Session Data

When authenticated via session, the `request.session` object contains:
- `user_id`: User ID
- `actualuser_id`: Actual user ID (for impersonation scenarios)
- `affiliate_id`: Affiliate ID
- `vertical`: Vertical identifier
- Other session-specific data

This data is available in route handlers via `request.session`.

