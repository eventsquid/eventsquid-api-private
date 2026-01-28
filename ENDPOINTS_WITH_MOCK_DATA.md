# Endpoints That May Return Mock/Empty Data

This document lists endpoints that may return empty arrays or objects when dependencies are unavailable or when services aren't fully implemented.

## MSSQL-Dependent Endpoints

These endpoints require MSSQL access and will return empty data (`[]` or `{}`) when MSSQL is unavailable (e.g., in local dev without MSSQL configured):

### Event Routes
- ✅ `GET /event/:eventID/profiles` - Returns `[]` if MSSQL unavailable
  - **Service**: `EventService.getEventProfiles`
  - **Status**: Fully implemented, but depends on MSSQL

### Registration Items Routes
- ✅ `GET /regitems/:eventID` - Returns `[]` if MSSQL unavailable
  - **Service**: `RegItemsService.getEventFeesByEvent`
  - **Status**: Fully implemented, but depends on MSSQL

### Agenda Routes
- ✅ `GET /agenda/:eventID/slots` - Returns `[]` if MSSQL unavailable
  - **Service**: `AgendaService.getAgendaSlotsData`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ `GET /agenda/slots/:eventID/grouped` - Returns `[]` if MSSQL unavailable
  - **Service**: `AgendaService.getAgendaData`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ `GET /agenda/slots/:eventGUID` - Returns `[]` if MSSQL unavailable
  - **Service**: `AgendaService.getVEOAgendaData`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ `GET /agenda/:eventGUID/slot/:slotID` - Returns `{}` if slot not found
  - **Service**: `AgendaService.getAgendaSlot`
  - **Status**: Fully implemented, returns `{}` legitimately if slot doesn't exist

### Check-In App Routes
- ✅ `GET /checkInApp/preferences/:eventID` - Returns `{}` if MSSQL unavailable
  - **Service**: `CheckInAppService.getPreferences`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ `PUT /checkInApp/preferences/:eventID` - Returns `{}` if body is empty
  - **Service**: `CheckInAppService.updatePreferences`
  - **Status**: Fully implemented, returns `{}` legitimately if no body provided

### Contact Scan App Routes
- ✅ `GET /contactScanApp/preferences/:eventID` - Returns `{}` if MSSQL unavailable
  - **Service**: `ContactScanAppService.getPreferences`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ `PUT /contactScanApp/preferences/:eventID` - Returns `{}` if body is empty
  - **Service**: `ContactScanAppService.updatePreferences`
  - **Status**: Fully implemented, returns `{}` legitimately if no body provided
- ✅ `PUT /contactScanApp/preferencesAPI/:eventID` - Returns `{}` if body is empty
  - **Service**: `ContactScanAppService.updateAPIPreferences`
  - **Status**: Fully implemented, returns `{}` legitimately if no body provided

### Credits Routes
- ✅ `GET /credits/userID/:userID` - Returns `[]` if MSSQL unavailable
  - **Service**: `CreditsService.getCreditsByUserID`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ `GET /credits/:eventID/categories` - Returns `[]` if MSSQL unavailable
  - **Service**: `CreditsService.getEventCreditCategories`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ Many other credits routes depend on MSSQL

### Reports Routes
- ✅ `GET /reports/:eventGUID/templates` - Returns `[]` if MSSQL unavailable
  - **Service**: `ReportService.getRegistrantTemplates`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ `POST /reports/:eventGUID/registrantReport` - Returns `[]` if MSSQL unavailable
  - **Service**: `ReportService.registrantReport`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ Many other reports routes depend on MSSQL

### Event Form Prompts Routes
- ✅ `GET /eventFormPrompts/:vert/:eventID/:profileID` - Returns `[]` if MSSQL unavailable
  - **Service**: `EventService.getEventConfig`
  - **Status**: Fully implemented, but depends on MSSQL

### Sponsors Routes
- ✅ `GET /sponsors/:affiliateID` - Returns `[]` if MSSQL unavailable
  - **Service**: `SponsorsService.getAffiliateSponsors`
  - **Status**: Fully implemented, but depends on MSSQL
- ✅ Many other sponsors routes depend on MSSQL

### Invitations Routes
- ✅ `GET /invitations/:eventID/invitees` - Returns `[]` if MSSQL unavailable
  - **Service**: `InvitationsService.getInviteeList`
  - **Status**: Fully implemented, but depends on MSSQL

## MongoDB-Only Endpoints (Should Work)

These endpoints only use MongoDB and should work if MongoDB is configured:

- ✅ `GET /event/:eventID/allData` - Uses MongoDB
- ✅ `POST /attendee/:vert` - Uses MongoDB (recently fixed)
- ✅ `GET /tableAssigner/assignment/byEvent/:vert/:eventID` - Uses MongoDB (recently fixed)
- ✅ `GET /qr/mobileAttendeeQR/:vert/:attendeeGUID` - Uses MongoDB (recently fixed)

## How to Identify Mock Data

### In Local Development

1. **Check server logs** for:
   - `⚠️ Returning mock connection - queries will return empty arrays`
   - `⚠️ MSSQL connection test failed!`
   - `⚠️ getEventProfiles returned empty results for event X`

2. **Check response format**:
   - Empty arrays: `[]`
   - Empty objects: `{}`
   - These are legitimate if no data exists, but suspicious if you know data should exist

3. **Test with MSSQL configured**:
   - Set `MSSQL_CONNECTION_STRING` or `MSSQL_HOST/USERNAME/PASSWORD` in `.env`
   - If endpoints start returning data, they were affected by missing MSSQL

## Solutions

### For Local Development

1. **Configure MSSQL** (if available):
   ```env
   MSSQL_CONNECTION_STRING=mssql://user:password@host:port/database
   # OR
   MSSQL_HOST=your-host
   MSSQL_USERNAME=your-username
   MSSQL_PASSWORD=your-password
   MSSQL_DATABASE=your-database
   ```

2. **Use MSSQL Tunnel** (if MSSQL is behind firewall):
   ```powershell
   .\setup-mssql-tunnel.ps1
   ```

3. **Accept Mock Data** (for testing):
   - Some endpoints will return empty data when MSSQL is unavailable
   - This is expected behavior in local dev without MSSQL access
   - The mock connection prevents crashes but returns empty arrays

### For Production

All endpoints should work correctly in production where MSSQL is properly configured via AWS Secrets Manager.

## Status Summary

- **Total Endpoints**: 247 routes
- **MSSQL-Dependent**: ~100+ routes (estimate)
- **MongoDB-Only**: ~50+ routes
- **Hybrid (Both)**: ~50+ routes
- **Public (No DB)**: ~10+ routes

**Note**: Most endpoints are fully implemented. The "mock data" issue is primarily due to MSSQL being unavailable in local development environments, not due to incomplete implementations.

## Testing MSSQL Connection

Since MSSQL is available in local dev, you can test which endpoints are working:

```bash
# Test MSSQL connection
node test-mssql-connection.js

# Check specific endpoints for mock data
node scripts/check-mock-endpoints.js
```

## Known Issues

1. **Agenda Slots**: Uses stored procedure `node_getAgendaSlots` - should work if stored procedure exists
2. Most other endpoints tested are working correctly with MSSQL

## Next Steps

If you're seeing specific endpoints return empty data when they shouldn't:
1. Check server logs for "Returning mock connection" messages
2. Verify the endpoint is using MSSQL correctly
3. Test the endpoint directly via API
4. Check if data exists in the database for the test event ID
