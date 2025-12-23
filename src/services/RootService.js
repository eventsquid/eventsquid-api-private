/**
 * Root Service
 * Migrated from Mantle RootService.js
 */

import { getConnection } from '../utils/mssql.js';

class RootService {
  /**
   * Get jurisdictions (states and countries)
   */
  async getJurisdictions() {
    try {
      const connection = await getConnection(null); // Use default connection
      
      const query = `
        USE EventsquidCommon;
        SELECT 
            s.id,
            s.name as name,
            c.countryID as country
        FROM States s
        LEFT JOIN Countries c on c.countryID = s.countryID
      `;
      
      const results = await connection.sql(query).execute();
      return results;
    } catch (error) {
      console.error('Error getting jurisdictions:', error);
      throw error;
    }
  }
}

export default RootService;

