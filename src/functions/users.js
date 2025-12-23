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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const user = await connection.sql(`
      USE ${dbName};
      SELECT ${columns.join(', ')}
      FROM b_users 
      WHERE user_id = @userID;
    `)
    .parameter('userID', TYPES.Int, Number(userID))
    .execute();

    return user.length ? user[0] : {};
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

