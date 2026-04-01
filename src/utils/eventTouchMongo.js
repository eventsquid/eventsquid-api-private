/**
 * Per-event serialization and atomic Mongo writes for touchEvent (events collection).
 */

const LOCK_COLLECTION = 'eventTouchLocks';
/** Lock lease — touch can run long (SQL + transform); Lambda timeout caps worst case. */
const LOCK_TTL_MS = 300000;
const MAX_LOCK_WAIT_MS = 90000;
const POLL_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {import('mongodb').MongoError | Error} err
 */
function isTransactionUnsupportedError(err) {
  if (!err) return false;
  const code = err.code;
  const codeName = err.codeName || '';
  if (code === 20 || codeName === 'IllegalOperation') return true;
  if (code === 303) return true; // Transaction numbers only allowed on replica set
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('transaction') && (msg.includes('replica') || msg.includes('mongos'))) return true;
  return false;
}

/**
 * Serialize touchEvent per (vertical, eventId) so concurrent runs cannot delete each other's inserts.
 */
export async function acquireEventTouchLock(db, vert, eventID) {
  const locks = db.collection(LOCK_COLLECTION);
  const lockKey = { s: vert, e: Number(eventID) };
  const deadline = Date.now() + MAX_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    try {
      await locks.insertOne({
        _id: lockKey,
        lockedUntil: new Date(Date.now() + LOCK_TTL_MS)
      });
      return;
    } catch (e) {
      if (e.code !== 11000) throw e;
      const res = await locks.updateOne(
        { _id: lockKey, lockedUntil: { $lte: new Date() } },
        { $set: { lockedUntil: new Date(Date.now() + LOCK_TTL_MS) } }
      );
      if (res.modifiedCount === 1) return;
      await sleep(POLL_MS);
    }
  }

  throw new Error(
    `Could not acquire event touch lock for vert=${vert} eventID=${eventID} within ${MAX_LOCK_WAIT_MS}ms`
  );
}

export async function releaseEventTouchLock(db, vert, eventID) {
  const locks = db.collection(LOCK_COLLECTION);
  await locks.deleteOne({ _id: { s: vert, e: Number(eventID) } });
}

/**
 * Delete + insert in one transaction so a failed insert never leaves the document deleted.
 * Falls back to legacy non-atomic path only when the server cannot run transactions (e.g. local standalone).
 *
 * @param {import('mongodb').MongoClient} client
 * @param {import('mongodb').Collection} eventsCollection
 * @param {import('mongodb').Document} filter
 * @param {import('mongodb').Document} eventData
 */
export async function replaceEventDocumentInEventsCollection(client, eventsCollection, filter, eventData) {
  const session = client.startSession();
  try {
    session.startTransaction();
    await eventsCollection.deleteOne(filter, { session });
    await eventsCollection.insertOne(eventData, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    if (isTransactionUnsupportedError(err)) {
      console.warn(
        '[touchEvent] MongoDB transactions unavailable; using non-atomic delete+insert:',
        err.message
      );
      await eventsCollection.deleteOne(filter);
      await eventsCollection.insertOne(eventData);
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
