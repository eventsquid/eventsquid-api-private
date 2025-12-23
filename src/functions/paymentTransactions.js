/**
 * Payment transaction functions
 * Migrated from Mantle functions/paymentTransactions
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _ from 'lodash';

/**
 * Find transaction by gateway and ID
 */
export async function findByGatewayAndID(request) {
  try {
    const { gateway, transactionID } = request.pathParameters || {};
    const vert = request.headers?.vert || request.vert || '';
    const affiliateID = request.session?.affiliate_id || 0;

    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    // Query using stored procedure
    const qryRA = await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_transactionsByGatewayAndID @processID, @gateway
    `)
    .parameter('processID', TYPES.VarChar, `%${_.trim(transactionID)}%`)
    .parameter('gateway', TYPES.VarChar, `%${_.trim(gateway)}%`)
    .execute();

    let transactionDetails = {};
    let transaction = {};

    // If this is an authnet transaction, get additional details
    // Note: AuthNet integration would need to be implemented separately
    if (_.trim(gateway) === 'authnet' && qryRA.length > 0) {
      // TODO: Implement AuthNet getTransactionDetails if needed
      // For now, just return the basic transaction data
      transaction = {
        status: 'pending',
        amount: 0,
        amountAuthorized: 0
      };
    }

    return {
      transaction: transaction,
      contestants: qryRA
    };
  } catch (error) {
    console.error('Error finding transaction by gateway and ID:', error);
    throw error;
  }
}

