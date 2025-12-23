# Route Analysis

Generated: 2025-12-11T19:48:23.511Z

## Summary
- Total Routes: 227
- Total Controllers: 34

## Routes by Controller

### activity-controller (1 routes)

- GET /attendee/:attendeeID

### affiliate-controller (11 routes)

- GET /:affiliateID/resources/grouped
- POST /:affiliateID/resource/add/document
- POST /:affiliateID/resource/add/video
- POST /:affiliateID/resource/replace/document
- POST /:affiliateID/resource/:resourceID
- GET /:affiliateID/resource/:resourceID/checkLinks
- DELETE /:affiliateID/resource/:resourceID/:type
- POST /:affiliateID/resources/categories/update
- DELETE /:affiliateID/resources/categories/delete/:category_id
- POST /:affiliateID/resources/categories/add
- GET /:affiliateID/surveys

### agenda-controller (5 routes)

- GET /agendaSlots/:eventID
- GET /slots/:eventID/grouped
- GET /slots/:eventGUID
- GET /:eventGUID/slot/:slotID
- GET /mobile/:eventID/slot/:slotID/resources

### api-controller (2 routes)

- DELETE /permissions/:userID
- POST /permissions/:userID

### attendee-controller (9 routes)

- POST /attendees-pivoted
- POST /:vert
- DELETE /:vert/:contestantID/prompts
- PUT /:vert/:contestantID/prompts
- POST /:contestantID/eventDocs
- GET /util-obj/:attendeeID
- POST /last-upd/:attendeeID
- POST /last-upd-by-user/:userID
- POST /last-upd-by-user-event/:userID/:eventID

### authNet-controller (8 routes)

- GET /publicKeyByAttendee/:attendeeID
- GET /publicKeyByAffiliate/:affiliateID
- POST /pay
- DELETE /refund/:contestantID/:affiliateID/:transactionID/:refundAmount
- GET /transactionDetails/:affiliateID/:transactionID
- POST /test/recordRefund
- GET /checkMultiCheckout/:contestantID
- GET /getPaymentForm/:login/:key/:payAmount/:contestantID/:affiliateID

### change-controller (3 routes)

- GET /attendee/:attendeeID
- GET /event/:eventID
- GET /affiliate/:affiliateID

### checkInApp-controller (2 routes)

- GET /preferences/:eventID
- PUT /preferences/:eventID

### chron-controller (3 routes)

- GET /pending-transactions
- GET /pending-transactions/:affiliateID
- POST /pending-transactions

### contactScanApp-controller (3 routes)

- GET /preferences/:eventID
- PUT /preferences/:eventID
- PUT /preferencesAPI/:eventID

### credits-controller (44 routes)

- GET /userID/:userID
- GET /new/userID/:userID
- GET /:eventID/categories
- GET /:eventID/categories/assignmentGrid
- GET /:eventID/categories/creditLibrary
- GET /:eventID/categories/grantDashboard
- GET /:eventID/categories/criteriaForm
- GET /:eventID/categories/report
- GET /:eventID/categories/unusedCategories
- PUT /category/:catID
- POST /category
- PUT /category/archive/:catID
- GET /:eventID/categories/awardedAttendees/:categoryID
- GET /:eventID/categories/sessions/:categoryID
- GET /:eventID/categories/grants/:categoryID
- GET /:eventID/packages
- POST /:eventID/packages
- GET /:eventID/packages/:packageID
- DELETE /:eventID/packages/:packageID
- PUT /:eventID/packages/:packageID
- PUT /:eventID/packages/:packageID/reset
- GET /:eventID/packages/:packageID/attendeesToAward/categories/:categoryID/sessions/:sessionID
- GET /:eventID/packages/:packageID/attendeesToDecline/categories/:categoryID/sessions/:sessionID
- GET /:eventID/packages/:packageID/exceptionLog/categories/:categoryID/sessions/:sessionID
- POST /:eventID/packages/exceptionLog
- PUT /:eventID/exceptionLog/:logID
- DELETE /:eventID/exceptionLog/:logID
- GET /transcript-template/:eventID
- GET /transcript-template/:eventID/user/:userID
- GET /transcript-template/:eventID/user/:userID/externalView
- GET /grants
- GET /:eventID/grants/cronRuns
- GET /:eventID/grants/scheduled
- POST /:eventID/grants
- PUT /:eventID/grants/:grantID
- GET /:eventID/grants/recent
- GET /:eventID/grants/recent/:logID
- GET /:eventID/grants/affectedAttendeesCount/:packageID
- GET /:eventID/grants/awardedAttendees/:logID
- GET /:eventID/grants/declinedAttendees/:logID
- GET /:eventID/grants/awardedAttendees/:logID/cat/:catID/item/:itemID
- GET /:eventID/grants/declinedAttendees/:logID/cat/:catID/item/:itemID
- PUT /:eventID/grants/unawardAttendee/:awardID
- GET /:eventID/sessions

### customFields-controller (2 routes)

- POST /:fieldID
- GET /:eventID

### download-controller (1 routes)

- GET /:fileGUID/:checkID

### email-controller (15 routes)

- POST /f1c174e7-7c5f-443e-bc5c-04ab46c623df
- POST /validate
- POST /verify
- GET /status/:mailType/:id/:status
- GET /by-type/:mailType/:id
- GET /counts-by-status/:mailType/:id
- GET /logs-by-affiliate/:affiliateID
- GET /invitation-mail-logs/:id
- GET /invitation-status/:mailID/:status
- GET /notification-mail-logs/:vertID/:eventID
- GET /by-contestant/:contestantID
- POST /list/from-service
- POST /import/from-service
- POST /send-verify-code
- GET /get-user-phone/:email

### eventFormPrompts-controller (2 routes)

- GET /:vert/:eventID/:profileID
- POST /:vert/:eventID/:profileID

### events-controller (19 routes)

- POST /
- POST /:eventID/customPrompts
- GET /:eventID/allData
- GET /:eventID/profiles
- PUT /:eventID
- GET /:eventID/duration
- POST /:eventGUID/updateTimezoneData
- POST /:eventGUID/item/:eventFeeID/updateTimezoneData
- POST /:eventID/speakers
- POST /:eventID/items
- POST /:eventID/stamp
- GET /:eventGUID/ics/:vert
- GET /:eventGUID/item/:eventFeeID/ics/:vert
- POST /:eventID/touchEvent
- POST /:eventID/sponsorLocationAgenda
- POST /:eventID/autoDeactivateFees
- PUT /:eventID/resetViewCounts
- GET /:eventGUID/resource/:videoID
- GET /:eventID/ceu/config

### import-controller (1 routes)

- POST /travel/:eventID/:profileID

### invitations-controller (6 routes)

- GET /:eventID/formData
- GET /:eventID/inviteCounts
- POST /:eventID/auditInvitees
- POST /:eventID/getInvitees
- GET /getTemplates
- DELETE /deleteTemplate/:recordID

### payment-controller (6 routes)

- POST /
- GET /affiliate-gateways
- POST /affiliate-gateway/:gatewayID
- DELETE /affiliate-gateway/:gatewayID
- GET /available-gateways
- POST /reset-affiliate-processor

### qr-controller (3 routes)

- GET /mobileAttendeeQR/:vert/:attendeeGUID
- GET /mobileSpecQR/:vert/:orderGUID
- GET /checkinSpectator/:vert/:orderGUID/:ticketItemGUID

### ratings-controller (2 routes)

- GET /session-by-slot/:eventID/:slotID
- POST /session-by-slot/:eventID/:slotID

### regitems-controller (7 routes)

- GET /:eventID/fees
- POST /:eventID/item/:eventFeeID
- DELETE /ce-link/:ceuEventFeeID
- PUT /ce-link/:ceuEventFeeID
- POST /:eventFeeID/ce-link
- PUT /:eventID/items/clear-codes
- PUT /:eventID/items/generate-codes

### reporting-controller (11 routes)

- GET /report-layouts/:eventGUID
- GET /report-layouts/:eventGUID/ceu-summary
- GET /report-layouts/:eventGUID/ceu-detail
- GET /report-layouts-by-cat/:eventGUID
- GET /report-layout/:reportID
- POST /report-layout/:reportID
- DELETE /report-layout/:reportID
- DELETE /report-layout/summary-report/:reportID
- DELETE /report-layout/detail-report/:reportID
- GET /report-layout-categories
- PUT /report-layout-categories/:eventGUID

### reports-controller (23 routes)

- GET /event-details/:eventGUID
- GET /report-details/:reportGUID
- GET /report-menu/:eventID
- GET /registrant/:eventID
- POST /registrant/:eventID
- GET /registrant/:reportGUID/export/:format/:checkID
- GET /registrant/:eventID/filters
- POST /registrant/:eventID/template
- GET /registrant/:eventID/templates
- POST /registrant-transactions
- GET /template/:reportType/:eventID/dupe-check/:templateName
- DELETE /template/:reportType/:eventID/:idg
- POST /share/template
- GET /bios-by-event/:eventID
- POST /:eventGUID/report-config
- GET /:eventID/ceu-summary-report
- GET /:eventGUID/ceu-summary-report/config/:reportID
- POST /ceu-summary-report/:eventGUID
- PUT /ceu-summary-report/:eventGUID/report/:reportID
- GET /:eventID/ceu-detail-report
- GET /:eventGUID/ceu-detail-report/config/:reportID
- POST /ceu-detail-report/:eventGUID
- PUT /ceu-detail-report/:eventGUID/report/:reportID

### root-controller (4 routes)

- POST /utcToEventZone
- POST /timezoneToUTC
- GET /jurisdictions
- POST /images/:vert

### sms-controller (4 routes)

- POST /${process.env.TWILIO_STATUS_CALLBACK}
- POST /send
- GET /:id
- POST /send-verify-code

### sponsors-controller (10 routes)

- POST /
- PUT /:sponsorID
- GET /affiliate/:affiliateID
- POST /logo
- DELETE /:sponsorID
- GET /event/:eventID
- GET /event/:eventID/sponsor/:sponsorID/level/:levelID
- GET /event/:eventID/sponsor/:sponsorID/resources/:section
- PUT /event/move
- PUT /event/sponsor/:sponsorID/level/:levelID

### stripe-controller (1 routes)

- POST /

### tableAssigner-controller (3 routes)

- POST /config/:vert
- GET /config/:vert/all/:eventID
- PUT /config/:vert/attendees/:eventID/:contestantID/cancel/

### transaction-controller (2 routes)

- GET /:gateway/:transactionID
- GET /contestant/:gateway/:contestantID

### transcript-controller (2 routes)

- GET /:eventID
- PUT /:eventID

### vantiv-worldpay-controller (2 routes)

- POST /transactionSetup
- DELETE /refund/:contestantID/:affiliateID/:transactionID/:refundAmount

### veo-controller (9 routes)

- GET /url/:eventID
- GET /getOptions/:eventGUID
- POST /saveOption
- GET /slotRatingsConfig/:slotID
- GET /usage/:slotID/:userID/:actionID
- POST /usage
- GET /config-data/:eventGUID
- GET /checkActive/:eventGUID
- GET /resources/:eventID

### verification-controller (1 routes)

- POST /

## Migration Checklist

- [ ] activity-controller (1 routes)
- [ ] affiliate-controller (11 routes)
- [ ] agenda-controller (5 routes)
- [ ] api-controller (2 routes)
- [ ] attendee-controller (9 routes)
- [ ] authNet-controller (8 routes)
- [ ] change-controller (3 routes)
- [ ] checkInApp-controller (2 routes)
- [ ] chron-controller (3 routes)
- [ ] contactScanApp-controller (3 routes)
- [ ] credits-controller (44 routes)
- [ ] customFields-controller (2 routes)
- [ ] download-controller (1 routes)
- [ ] email-controller (15 routes)
- [ ] eventFormPrompts-controller (2 routes)
- [ ] events-controller (19 routes)
- [ ] import-controller (1 routes)
- [ ] invitations-controller (6 routes)
- [ ] payment-controller (6 routes)
- [ ] qr-controller (3 routes)
- [ ] ratings-controller (2 routes)
- [ ] regitems-controller (7 routes)
- [ ] reporting-controller (11 routes)
- [ ] reports-controller (23 routes)
- [ ] root-controller (4 routes)
- [ ] sms-controller (4 routes)
- [ ] sponsors-controller (10 routes)
- [ ] stripe-controller (1 routes)
- [ ] tableAssigner-controller (3 routes)
- [ ] transaction-controller (2 routes)
- [ ] transcript-controller (2 routes)
- [ ] vantiv-worldpay-controller (2 routes)
- [ ] veo-controller (9 routes)
- [ ] verification-controller (1 routes)
