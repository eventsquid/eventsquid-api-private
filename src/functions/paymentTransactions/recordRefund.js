/**
 * Record refund
 * Migrated from functions/paymentTransactions/recordRefund.js
 */

import { getConnection, getDatabaseName, TYPES } from '../../utils/mssql.js';
import { getDatabase } from '../../utils/mongodb.js';
import _ from 'lodash';

/**
 * After a refund/void, sync the attendee's transaction list in MongoDB
 * from the authoritative contestant_transactions table in MSSQL.
 */
async function updateTransactionsMongo(attendeeID, vert) {
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const totalPaidRequest = new sql.Request();
  totalPaidRequest.input('attendeeID', TYPES.Int, Number(attendeeID));
  const totalPaidResult = await totalPaidRequest.query(`
    USE ${dbName};
    DECLARE @regTotalPaid DECIMAL(10,2);
    SET @regTotalPaid = ISNULL((
      SELECT SUM(ISNULL(amount, 0))
      FROM contestant_transactions
      WHERE contestant_id = @attendeeID
    ), 0);
    SELECT @regTotalPaid AS regTotalPaid;
  `);

  const transactionsRequest = new sql.Request();
  transactionsRequest.input('attendeeID', TYPES.Int, Number(attendeeID));
  const transactionsResult = await transactionsRequest.query(`
    USE ${dbName};
    SELECT
      amount   AS [am],
      processDate AS [pd],
      processDate AS [pdi],
      processID   AS [pi],
      processToken AS [ptk],
      payMethod AS pm
    FROM contestant_transactions
    WHERE contestant_id = @attendeeID;
  `);

  const totalPaid = Number(totalPaidResult.recordset[0]?.regTotalPaid || 0);
  const transactions = transactionsResult.recordset || [];

  const db = await getDatabase(null, vert);
  await db.collection('attendees').updateOne(
    { c: Number(attendeeID), sg: { $exists: false } },
    {
      $currentDate: { lu: { $type: 'date' } },
      $set: { tr: transactions, tp: totalPaid }
    }
  );

  return { totalPaid, transactionCount: transactions.length };
}

/**
 * After a refund/void, sync the attendee's financial summary in MongoDB
 * from the authoritative eventContestant/contestant_transactions tables in MSSQL.
 */
async function updateFinancialsMongo(attendeeID, vert) {
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const request = new sql.Request();
  request.input('attendeeID', TYPES.Int, Number(attendeeID));
  const result = await request.query(`
    USE ${dbName};
    DECLARE @regTotalPaid DECIMAL(10,2);
    SET @regTotalPaid = ISNULL((
      SELECT SUM(ISNULL(amount, 0))
      FROM contestant_transactions
      WHERE contestant_id = @attendeeID
    ), 0);
    SELECT
      ISNULL(ec.totalDue, 0)       AS totalDue,
      ISNULL(ec.finalDiscount, 0)  AS finalDiscount,
      @regTotalPaid                AS totalPaid,
      payMailWire,
      payAtEvent,
      payOnlineLater,
      CASE
        WHEN ISNULL(ec.totalDue, 0) = 0 THEN CAST(0 AS DECIMAL(10,2))
        WHEN (payMailWire = 1 OR payAtEvent = 1 OR payCustomMethod = 1) AND surchargeCCOnly = 1
          THEN CAST(ISNULL(ec.totalDue, 0) - surTotal - (ISNULL(ec.couponValue, 0) + @regTotalPaid) AS DECIMAL(10,2))
        ELSE CAST(ISNULL(ec.totalDue, 0) - (ISNULL(ec.couponValue, 0) + @regTotalPaid) AS DECIMAL(10,2))
      END AS netDue
    FROM eventContestant AS ec
      INNER JOIN b_events AS e ON ec.event_id = e.event_id
    WHERE ec.contestant_id = @attendeeID;
  `);

  const row = result.recordset[0];
  if (!row) return {};

  const db = await getDatabase(null, vert);
  await db.collection('attendees').updateOne(
    { c: Number(attendeeID), sg: { $exists: false } },
    {
      $currentDate: { lu: { $type: 'date' } },
      $set: {
        td:  Number(row.totalDue),
        tp:  Number(row.totalPaid),
        di:  Number(row.finalDiscount),
        nd:  Number(row.netDue),
        pym: Number(row.payMailWire),
        pye: Number(row.payAtEvent),
        pyl: Number(row.payOnlineLater)
      }
    }
  );

  return { totalDue: row.totalDue, totalPaid: row.totalPaid, netDue: row.netDue };
}

/**
 * Record a refund (or failed refund) against a contestant in MSSQL,
 * then sync the attendee's transaction list and financial summary in MongoDB.
 *
 * Expected fields on request.body:
 *   amount  {number}  — negative for a real refund, 0 for a failed attempt
 *   c       {number}  — contestant (attendee) ID
 *   pi      {string}  — original processID / transactionID
 *   ptk     {string}  — processToken (pass "" if none)
 *   rfi     {string}  — refund transaction ID returned by the gateway
 *   rfn     {string}  — refund notes (optional)
 */
export async function recordRefund(request) {
  const vert = request.headers?.vert || '';
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const sqlRequest = new sql.Request();
  sqlRequest.input('amount',       TYPES.Money,   Number(request.body.amount));
  sqlRequest.input('attendeeID',   TYPES.Int,     Number(request.body.c));
  sqlRequest.input('processID',    TYPES.VarChar, _.truncate(_.trim(request.body.pi  || ''), { length: 150, omission: '' }));
  sqlRequest.input('processToken', TYPES.VarChar, _.truncate(_.trim(request.body.ptk || ''), { length: 150, omission: '' }));
  sqlRequest.input('refundID',     TYPES.VarChar, _.truncate(_.trim(request.body.rfi || ''), { length: 150, omission: '' }));
  sqlRequest.input('refundNotes',  TYPES.VarChar, _.truncate(_.trim(request.body.rfn || ''), { length: 150, omission: '' }));

  const sqlResult = await sqlRequest.query(`
    USE ${dbName};
    EXEC dbo.node_recordRefund @amount, @attendeeID, @processID, @processToken, @refundID, @refundNotes;
  `);

  const attendeeID = Number(request.body.c);
  const [txm, fnm] = await Promise.all([
    updateTransactionsMongo(attendeeID, vert),
    updateFinancialsMongo(attendeeID, vert)
  ]);

  return {
    sql: sqlResult,
    mongo: {
      updateTransactions: txm,
      updateFinancials: fnm
    }
  };
}
