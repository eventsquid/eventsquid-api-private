/**
 * Detailed MSSQL connection test
 * Tests different query formats and connection states
 */

import 'dotenv/config';
import { getConnection, TYPES } from './src/utils/mssql.js';

async function testDetailed() {
  console.log('🔍 Detailed MSSQL Connection Test\n');
  
  try {
    console.log('1. Getting connection...');
    const connection = await getConnection('es');
    console.log('   ✅ Connection object received');
    console.log(`   Type: ${typeof connection}`);
    console.log(`   Has sql method: ${typeof connection.sql === 'function'}`);
    
    console.log('\n2. Testing simple query without USE...');
    try {
      const result1 = await connection.sql('SELECT 1 as test').execute();
      console.log(`   Result: ${JSON.stringify(result1)}`);
      console.log(`   Is Array: ${Array.isArray(result1)}`);
      console.log(`   Length: ${Array.isArray(result1) ? result1.length : 'N/A'}`);
    } catch (err) {
      console.log(`   Error: ${err.message}`);
    }
    
    console.log('\n3. Testing query with USE statement...');
    try {
      const result2 = await connection.sql(`
        USE eventsquid;
        SELECT 1 as test
      `).execute();
      console.log(`   Result: ${JSON.stringify(result2)}`);
      console.log(`   Is Array: ${Array.isArray(result2)}`);
      console.log(`   Length: ${Array.isArray(result2) ? result2.length : 'N/A'}`);
    } catch (err) {
      console.log(`   Error: ${err.message}`);
    }
    
    console.log('\n4. Testing query with parameter...');
    try {
      const result3 = await connection.sql(`
        USE eventsquid;
        SELECT TOP 1 bundle_id, bundle_name 
        FROM event_fee_bundles
        WHERE event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, 23513)
      .execute();
      console.log(`   Result: ${JSON.stringify(result3)}`);
      console.log(`   Is Array: ${Array.isArray(result3)}`);
      console.log(`   Length: ${Array.isArray(result3) ? result3.length : 'N/A'}`);
      if (Array.isArray(result3) && result3.length > 0) {
        console.log(`   First row: ${JSON.stringify(result3[0], null, 2)}`);
      }
    } catch (err) {
      console.log(`   Error: ${err.message}`);
      console.log(`   Stack: ${err.stack}`);
    }
    
    console.log('\n5. Testing COUNT query...');
    try {
      const result4 = await connection.sql(`
        USE eventsquid;
        SELECT COUNT(*) as total FROM event_fee_bundles WHERE event_id = @eventID
      `)
      .parameter('eventID', TYPES.Int, 23513)
      .execute();
      console.log(`   Result: ${JSON.stringify(result4)}`);
      console.log(`   Is Array: ${Array.isArray(result4)}`);
      if (Array.isArray(result4) && result4.length > 0) {
        console.log(`   Count: ${result4[0].total}`);
      }
    } catch (err) {
      console.log(`   Error: ${err.message}`);
    }
    
    console.log('\n✅ All tests completed');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

testDetailed();
