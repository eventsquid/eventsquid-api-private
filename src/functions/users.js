/**
 * Users functions
 * Migrated from Mantle functions/users
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

/**
 * Get user by ID
 */
export async function getUserByID(userID, columns, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('userID', sql.Int, Number(userID));
    const result = await request.query(`
      USE ${dbName};
      SELECT ${columns.join(', ')}
      FROM b_users 
      WHERE user_id = @userID;
    `);
    const user = result.recordset;

    return user.length ? user[0] : {};
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

