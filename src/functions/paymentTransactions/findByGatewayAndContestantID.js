/**
 * Find transactions by gateway and contestant ID
 * Migrated from functions/paymentTransactions/findByGatewayAndContestantID.js
 */

import { getConnection, getDatabaseName, TYPES } from '../../utils/mssql.js';
import _ from 'lodash';

export async function findByGatewayAndContestantID(gateway, contestantID, vert) {
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const contestantRequest = new sql.Request();
  contestantRequest.input('contestantID', TYPES.Int, Number(contestantID));
  const contestantResult = await contestantRequest.query(`
    USE ${dbName};
    SELECT
      u.user_firstname + ' ' + u.user_lastname AS name,
      ec.contestant_id
    FROM eventContestant ec
    LEFT JOIN b_users u ON u.user_id = ec.user_id
    WHERE ec.contestant_id = @contestantID;
  `);

  const transactionsRequest = new sql.Request();
  transactionsRequest.input('gateway',      TYPES.VarChar, _.trim(gateway));
  transactionsRequest.input('contestantID', TYPES.Int,     Number(contestantID));
  const transactionsResult = await transactionsRequest.query(`
    USE ${dbName};
    SELECT *
    FROM contestant_transactions
    WHERE payMethod = @gateway AND contestant_id = @contestantID;
  `);

  return {
    contestant:   contestantResult.recordset[0] || {},
    transactions: transactionsResult.recordset  || []
  };
}
