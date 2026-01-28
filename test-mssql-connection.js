/**
 * Test MSSQL connection script
 * Run this to verify MSSQL is accessible before starting the local server
 * 
 * Usage: node test-mssql-connection.js
 */

import 'dotenv/config';
import { getConnection } from './src/utils/mssql.js';

async function testMssqlConnection() {
  console.log('🔍 Testing MSSQL connection...\n');
  
  // Check environment variables
  if (!process.env.MSSQL_HOST && !process.env.MSSQL_CONNECTION_STRING) {
    console.error('❌ MSSQL credentials not found in environment variables');
    console.error('\nPlease set one of the following in your .env file:');
    console.error('  Option 1: MSSQL_CONNECTION_STRING=Server=host,1433;Database=db;User Id=user;Password=pass;');
    console.error('  Option 2: MSSQL_HOST, MSSQL_USERNAME, MSSQL_PASSWORD, MSSQL_DATABASE');
    process.exit(1);
  }
  
  console.log('📋 Configuration:');
  if (process.env.MSSQL_CONNECTION_STRING) {
    console.log('  Using: MSSQL_CONNECTION_STRING');
    // Don't print full connection string (contains password)
    const parts = process.env.MSSQL_CONNECTION_STRING.split(';');
    parts.forEach(part => {
      if (part.toLowerCase().includes('password') || part.toLowerCase().includes('pwd')) {
        console.log(`  ${part.split('=')[0]}=***`);
      } else {
        console.log(`  ${part}`);
      }
    });
  } else {
    console.log(`  Host: ${process.env.MSSQL_HOST || 'not set'}`);
    console.log(`  Port: ${process.env.MSSQL_PORT || '1433'}`);
    console.log(`  Database: ${process.env.MSSQL_DATABASE || 'eventsquid'}`);
    console.log(`  Username: ${process.env.MSSQL_USERNAME || 'not set'}`);
    console.log(`  Password: ${process.env.MSSQL_PASSWORD ? '***' : 'not set'}`);
  }
  console.log('');
  
  try {
    console.log('🔄 Connecting to MSSQL...');
    const connection = await getConnection('es'); // Test with eventsquid vertical
    
    console.log('✅ Connection pool created successfully');
    
    console.log('🔄 Testing query execution...');
    
    // Test 1: Simple query
    console.log('   Test 1: SELECT 1 as test');
    const result1 = await connection.sql('SELECT 1 as test').execute();
    console.log(`   Result: ${JSON.stringify(result1)}`);
    console.log(`   Type: ${Array.isArray(result1) ? 'Array' : typeof result1}, Length: ${Array.isArray(result1) ? result1.length : 'N/A'}`);
    
    // Test 2: Query that should return data (test with event_fee_bundles)
    console.log('\n   Test 2: SELECT COUNT(*) FROM event_fee_bundles');
    try {
      const result2 = await connection.sql('SELECT COUNT(*) as count FROM event_fee_bundles').execute();
      console.log(`   Result: ${JSON.stringify(result2)}`);
    } catch (err) {
      console.log(`   Error: ${err.message}`);
    }
    
    // Test 3: Query with USE database
    console.log('\n   Test 3: USE eventsquid; SELECT TOP 1 bundle_id FROM event_fee_bundles');
    try {
      const result3 = await connection.sql(`
        USE eventsquid;
        SELECT TOP 1 bundle_id, bundle_name 
        FROM event_fee_bundles
      `).execute();
      console.log(`   Result: ${JSON.stringify(result3)}`);
      console.log(`   Type: ${Array.isArray(result3) ? 'Array' : typeof result3}, Length: ${Array.isArray(result3) ? result3.length : 'N/A'}`);
    } catch (err) {
      console.log(`   Error: ${err.message}`);
    }
    
    if (result1 !== undefined) {
      console.log('\n✅ Query execution test completed!');
      console.log('🎉 MSSQL connection is working!');
      console.log('   You can now start the local server with: npm run dev');
    } else {
      console.log('\n⚠️  Query executed but returned undefined');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ MSSQL connection failed!');
    console.error(`   Error: ${error.message}`);
    
    if (error.message.includes('createSecurePair')) {
      console.error('\n💡 This is a Node.js 24 compatibility issue with tedious-connection-pool');
      console.error('   The connection code has been updated to disable encryption in local dev');
      console.error('   If you still see this error, try:');
      console.error('   1. Restart your terminal and try again');
      console.error('   2. Clear node_modules and reinstall: npm install');
      console.error('   3. Check that NODE_ENV=development is set in .env');
    } else if (error.message.includes('ETIMEOUT') || error.message.includes('Failed to connect')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   1. If using SSH tunnel, verify it is active:');
      console.error('      netstat -an | findstr 1433');
      console.error('   2. If using VPN, verify VPN is connected');
      console.error('   3. Test connectivity:');
      console.error(`      telnet ${process.env.MSSQL_HOST || 'localhost'} ${process.env.MSSQL_PORT || '1433'}`);
      console.error('   4. Verify RDS security group allows your IP/VPN');
    } else if (error.message.includes('Login failed')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   1. Verify username and password are correct');
      console.error('   2. Check user has permissions on the database');
      console.error('   3. Ensure database name is correct (eventsquid, launchsquid, etc.)');
    }
    
    process.exit(1);
  }
}

testMssqlConnection();
