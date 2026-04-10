/**
 * Middleware: userRegisteredForEvent
 *
 * Blocks access unless the authenticated user is one of:
 *   1. A level-10 (super) admin
 *   2. A registered attendee for the event (regComplete = 1, not scratched)
 *   3. An admin user associated with the event's affiliate
 *
 * Expects `request.session` to already be populated by `authenticate`.
 * Expects `request.pathParameters.eventGUID` to be present on the route.
 * Throws an error with a `statusCode` property so the handler returns the right HTTP status.
 */

import { getEventDataByGUID } from '../functions/events.js';
import { getRegisteredAttendeeByUserID } from '../functions/attendees.js';
import { getAffiliateUsers } from '../functions/affiliate.js';

export async function userRegisteredForEvent(request) {
  const session = request.session;

  if (!session || !session.user_id) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  // Level-10 admins bypass the registration check
  if (session.user_admin_level === 10) return;

  const { eventGUID } = request.pathParameters || {};
  const vert = request.headers?.vert;

  if (!eventGUID || !vert) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  // Resolve eventID and affiliateID from the GUID
  const event = await getEventDataByGUID(eventGUID, { e: 1, a: 1 }, vert);

  // Check if the user is a registered attendee
  const attendee = await getRegisteredAttendeeByUserID(
    Number(session.user_id),
    Number(event.e),
    vert
  );

  if (attendee) return;

  // Fall back: check if the user is an affiliate admin for this event's affiliate
  const affAdmins = await getAffiliateUsers(Number(event.a), vert);
  if (affAdmins.some(admin => admin.user_id === Number(session.user_id))) return;

  const err = new Error('You are not registered for this event');
  err.statusCode = 401;
  throw err;
}
