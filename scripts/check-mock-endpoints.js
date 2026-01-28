/**
 * Script to check which endpoints are returning mock/empty data
 * 
 * Usage: node scripts/check-mock-endpoints.js
 * 
 * This script will:
 * 1. Test MSSQL connection
 * 2. Test a sample of key endpoints
 * 3. Report which ones are returning empty data
 */

import 'dotenv/config';
import { getConnection } from '../src/utils/mssql.js';

const TEST_ENDPOINTS = [
  {
    name: 'Event Profiles',
    path: '/event/23513/profiles',
    method: 'GET',
    service: 'EventService.getEventProfiles',
    testQuery: async (connection, dbName) => {
      const result = await connection.sql(`
        USE ${dbName};
        SELECT TOP 5 bundle_id, bundle_name, event_id
        FROM event_fee_bundles
        WHERE event_id = 23513
      `).execute();
      return result;
    }
  },
  {
    name: 'Registration Items',
    path: '/regitems/23513',
    method: 'GET',
    service: 'RegItemsService.getEventFeesByEvent',
    testQuery: async (connection, dbName) => {
      const result = await connection.sql(`
        USE ${dbName};
        SELECT TOP 5 eventFeeID, customFeeName, event_id
        FROM event_fees
        WHERE event_id = 23513
      `).execute();
      return result;
    }
  },
  {
    name: 'Agenda Slots',
    path: '/agenda/agendaSlots/23513',
    method: 'GET',
    service: 'AgendaService.getAgendaData (uses stored procedure)',
    testQuery: async (connection, dbName) => {
      const { TYPES } = await import('../src/utils/mssql.js');
      const result = await connection.sql(`
        USE ${dbName};
        EXEC dbo.node_getAgendaSlots @eventID
      `)
      .parameter('eventID', TYPES.Int, 23513)
      .execute();
      return result;
    }
  },
  {
    name: 'Check-In App Preferences',
    path: '/checkInApp/preferences/23513',
    method: 'GET',
    service: 'CheckInAppService.getPreferences',
    testQuery: async (connection, dbName) => {
      const result = await connection.sql(`
        USE ${dbName};
        SELECT event_id, autoAdvance, autoAdvanceRevert, multiDayCheckIn
        FROM b_events
        WHERE event_id = 23513
      `).execute();
      return result;
    }
  },
  {
    name: 'Contact Scan App Preferences',
    path: '/contactScanApp/preferences/23513',
    method: 'GET',
    service: 'ContactScanAppService.getPreferences',
    testQuery: async (connection, dbName) => {
      const result = await connection.sql(`
        USE ${dbName};
        SELECT event_id, scanAppActive, scanAppCode
        FROM b_events
        WHERE event_id = 23513
      `).execute();
      return result;
    }
  }
];

async function checkMockEndpoints() {
  console.log('🔍 Checking for endpoints returning mock/empty data...\n');
  
  // Test MSSQL connection first
  console.log('1️⃣ Testing MSSQL Connection...');
  try {
    const connection = await getConnection('es');
    console.log('   ✅ Connection pool created');
    
    // Test simple query
    const testResult = await connection.sql('SELECT 1 as test').execute();
    if (Array.isArray(testResult) && testResult.length > 0) {
      console.log('   ✅ Connection test query successful');
      console.log(`   ✅ Test result: ${JSON.stringify(testResult)}`);
    } else {
      console.log('   ⚠️  Connection test returned empty array - might be using mock connection');
      console.log('   ⚠️  Check server logs for "Returning mock connection" message');
    }
  } catch (error) {
    console.error('   ❌ MSSQL connection failed!');
    console.error(`   Error: ${error.message}`);
    console.error('\n   This means all MSSQL-dependent endpoints will return empty data.');
    console.error('   Please check your MSSQL configuration in .env file.');
    process.exit(1);
  }
  
  console.log('\n2️⃣ Testing Key Endpoints...\n');
  
  const dbName = 'eventsquid'; // Default for 'es' vertical
  const connection = await getConnection('es');
  
  let mockCount = 0;
  let workingCount = 0;
  
  for (const endpoint of TEST_ENDPOINTS) {
    try {
      console.log(`Testing: ${endpoint.name}`);
      console.log(`  Path: ${endpoint.path}`);
      console.log(`  Service: ${endpoint.service}`);
      
      const result = await endpoint.testQuery(connection, dbName);
      
      if (Array.isArray(result)) {
        if (result.length === 0) {
          console.log(`  ❌ Returns empty array (might be mock data)`);
          console.log(`  ⚠️  This could mean:`);
          console.log(`     - Data doesn't exist for event 23513`);
          console.log(`     - Using mock connection (check server logs)`);
          console.log(`     - Query has a bug`);
          mockCount++;
        } else {
          console.log(`  ✅ Returns ${result.length} records`);
          console.log(`  ✅ Sample: ${JSON.stringify(result[0])}`);
          workingCount++;
        }
      } else {
        console.log(`  ⚠️  Returns non-array: ${typeof result}`);
        console.log(`  Result: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.log(`  ❌ Query failed: ${error.message}`);
      mockCount++;
    }
    
    console.log('');
  }
  
  console.log('📊 Summary:');
  console.log(`  ✅ Working endpoints: ${workingCount}`);
  console.log(`  ❌ Potentially mock/empty: ${mockCount}`);
  console.log(`  Total tested: ${TEST_ENDPOINTS.length}`);
  
  if (mockCount > 0) {
    console.log('\n💡 Next Steps:');
    console.log('  1. Check server logs when starting the server');
    console.log('  2. Look for "Returning mock connection" messages');
    console.log('  3. Verify MSSQL connection test passes on server startup');
    console.log('  4. Test specific endpoints via API to see actual responses');
  }
  
  process.exit(0);
}

checkMockEndpoints().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
