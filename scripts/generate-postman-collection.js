import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read route files and extract route definitions
const routesDir = path.join(__dirname, '../src/routes');
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js') && f !== 'index.js' && f !== 'example-mongo.js');

const allRoutes = [];

// Read each route file and extract route info
for (const file of routeFiles) {
  try {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    
    // Extract route definitions using regex
    const routeRegex = /export const (\w+)Route = \{[\s\S]*?method:\s*['"](GET|POST|PUT|DELETE|PATCH)['"][\s\S]*?path:\s*['"]([^'"]+)['"][\s\S]*?\};/g;
    let match;
    
    while ((match = routeRegex.exec(content)) !== null) {
      const [, routeName, method, path] = match;
      allRoutes.push({ name: routeName, method, path, file });
    }
  } catch (error) {
    console.error(`Error reading ${file}:`, error.message);
  }
}

// Also add health check
allRoutes.push({ name: 'healthCheck', method: 'GET', path: '/health', file: 'index.js' });

// Group routes by category
const categories = {
  'Health Check': [],
  'Root': [],
  'Events': [],
  'Attendees': [],
  'Agenda': [],
  'Registration Items': [],
  'Activity': [],
  'QR (Public)': [],
  'Ratings': [],
  'Verification': [],
  'Changes': [],
  'Custom Fields': [],
  'Event Form Prompts': [],
  'Invitations': [],
  'Sponsors': [],
  'Download (Public)': [],
  'Check-In App': [],
  'Contact Scan App': [],
  'Chron (Cron)': [],
  'Import': [],
  'Transcripts': [],
  'Table Assigner': [],
  'SMS': [],
  'Stripe': [],
  'Transaction': [],
  'Vantiv/Worldpay': [],
  'VEO': [],
  'Affiliate': [],
  'Payment': [],
  'AuthNet': [],
  'Email': [],
  'Reports': [],
  'Credits': [],
  'Reporting': [],
  'API': []
};

// Categorize routes
for (const route of allRoutes) {
  const pathLower = route.path.toLowerCase();
  const nameLower = route.name.toLowerCase();
  
  if (pathLower.includes('/health')) {
    categories['Health Check'].push(route);
  } else if (pathLower.includes('/utctoeventzone') || pathLower.includes('/timezonetoutc') || pathLower.includes('/jurisdictions') || pathLower.includes('/images')) {
    categories['Root'].push(route);
  } else if (pathLower.includes('/event') && !pathLower.includes('/attendee') && !pathLower.includes('/agenda')) {
    categories['Events'].push(route);
  } else if (pathLower.includes('/attendee')) {
    categories['Attendees'].push(route);
  } else if (pathLower.includes('/agenda')) {
    categories['Agenda'].push(route);
  } else if (pathLower.includes('/regitems') || pathLower.includes('/regitem')) {
    categories['Registration Items'].push(route);
  } else if (pathLower.includes('/activity')) {
    categories['Activity'].push(route);
  } else if (pathLower.includes('/qr')) {
    categories['QR (Public)'].push(route);
  } else if (pathLower.includes('/ratings') || pathLower.includes('/session')) {
    categories['Ratings'].push(route);
  } else if (pathLower.includes('/verification')) {
    categories['Verification'].push(route);
  } else if (pathLower.includes('/changes')) {
    categories['Changes'].push(route);
  } else if (pathLower.includes('/customfields') || pathLower.includes('/customfield')) {
    categories['Custom Fields'].push(route);
  } else if (pathLower.includes('/eventformprompts') || pathLower.includes('/eventformprompt')) {
    categories['Event Form Prompts'].push(route);
  } else if (pathLower.includes('/invitation')) {
    categories['Invitations'].push(route);
  } else if (pathLower.includes('/sponsor')) {
    categories['Sponsors'].push(route);
  } else if (pathLower.includes('/download')) {
    categories['Download (Public)'].push(route);
  } else if (pathLower.includes('/checkinapp') || pathLower.includes('/check-in')) {
    categories['Check-In App'].push(route);
  } else if (pathLower.includes('/contactscanapp') || pathLower.includes('/contactscan')) {
    categories['Contact Scan App'].push(route);
  } else if (pathLower.includes('/chron')) {
    categories['Chron (Cron)'].push(route);
  } else if (pathLower.includes('/import')) {
    categories['Import'].push(route);
  } else if (pathLower.includes('/transcript')) {
    categories['Transcripts'].push(route);
  } else if (pathLower.includes('/tableassigner') || pathLower.includes('/table-assigner')) {
    categories['Table Assigner'].push(route);
  } else if (pathLower.includes('/sms')) {
    categories['SMS'].push(route);
  } else if (pathLower.includes('/stripe')) {
    categories['Stripe'].push(route);
  } else if (pathLower.includes('/transaction') && !pathLower.includes('/authnet')) {
    categories['Transaction'].push(route);
  } else if (pathLower.includes('/vantiv') || pathLower.includes('/worldpay')) {
    categories['Vantiv/Worldpay'].push(route);
  } else if (pathLower.includes('/veo')) {
    categories['VEO'].push(route);
  } else if (pathLower.includes('/affiliate')) {
    categories['Affiliate'].push(route);
  } else if (pathLower.includes('/payment') && !pathLower.includes('/authnet')) {
    categories['Payment'].push(route);
  } else if (pathLower.includes('/authnet')) {
    categories['AuthNet'].push(route);
  } else if (pathLower.includes('/email')) {
    categories['Email'].push(route);
  } else if (pathLower.includes('/reports/') && !pathLower.includes('/reporting/')) {
    categories['Reports'].push(route);
  } else if (pathLower.includes('/credits')) {
    categories['Credits'].push(route);
  } else if (pathLower.includes('/reporting/')) {
    categories['Reporting'].push(route);
  } else if (pathLower.includes('/api/')) {
    categories['API'].push(route);
  } else {
    categories['Root'].push(route); // Default to root
  }
}

// Generate Postman collection
const collection = {
  info: {
    _postman_id: 'eventsquid-api-collection',
    name: 'EventSquid API',
    description: 'Complete API collection for EventSquid Private API\n\nAuthentication:\n- Session: Use headers `cftoken` and `cfid`\n- Dev Token: Use header `devtoken`\n- Public endpoints: No auth required\n\nSee docs/AUTHENTICATION.md for details.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  auth: {
    type: 'noauth'
  },
  variable: [
    {
      key: 'baseUrl',
      value: 'https://rx8dxmccg2.execute-api.us-west-2.amazonaws.com/dev',
      type: 'string'
    },
    {
      key: 'cftoken',
      value: '',
      type: 'string',
      description: 'Session token from login'
    },
    {
      key: 'cfid',
      value: '',
      type: 'string',
      description: 'Session ID from login'
    },
    {
      key: 'devtoken',
      value: '',
      type: 'string',
      description: 'Dev token for testing (alternative to session auth)'
    },
    {
      key: 'eventID',
      value: '1',
      type: 'string'
    },
    {
      key: 'vert',
      value: 'es',
      type: 'string',
      description: 'Vertical identifier'
    }
  ],
  item: []
};

// Helper to determine if route needs auth
function needsAuth(route) {
  const publicPaths = ['/health', '/qr/', '/download/', '/verification/verify', '/email/f1c174e7-7c5f-443e-bc5c-04ab46c623df', '/stripe', '/sms/twilio-status'];
  return !publicPaths.some(publicPath => route.path.toLowerCase().includes(publicPath));
}

// Helper to create request item
function createRequestItem(route) {
  const headers = [];
  
  if (needsAuth(route)) {
    // Add auth headers - user can choose session or dev token
    headers.push({
      key: 'cftoken',
      value: '{{cftoken}}',
      disabled: false
    });
    headers.push({
      key: 'cfid',
      value: '{{cfid}}',
      disabled: false
    });
  }
  
  // Add vert header if path includes :vert
  if (route.path.includes(':vert')) {
    headers.push({
      key: 'vert',
      value: '{{vert}}'
    });
  }
  
  // Add Content-Type for POST/PUT
  if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
    headers.push({
      key: 'Content-Type',
      value: 'application/json'
    });
  }
  
  // Replace path parameters with variables
  let urlPath = route.path
    .replace(/:eventID/g, '{{eventID}}')
    .replace(/:vert/g, '{{vert}}')
    .replace(/:userID/g, ':userID')
    .replace(/:regID/g, ':regID')
    .replace(/:slotID/g, ':slotID')
    .replace(/:sponsorID/g, ':sponsorID')
    .replace(/:affiliateID/g, ':affiliateID')
    .replace(/:attendeeID/g, ':attendeeID')
    .replace(/:eventGUID/g, ':eventGUID')
    .replace(/:reportGUID/g, ':reportGUID')
    .replace(/:categoryID/g, ':categoryID')
    .replace(/:packageID/g, ':packageID')
    .replace(/:gatewayID/g, ':gatewayID')
    .replace(/:transactionID/g, ':transactionID')
    .replace(/:contestantID/g, ':contestantID')
    .replace(/:fileGUID/g, ':fileGUID')
    .replace(/:checkID/g, ':checkID')
    .replace(/:attendeeGUID/g, ':attendeeGUID')
    .replace(/:orderGUID/g, ':orderGUID')
    .replace(/:ticketItemGUID/g, ':ticketItemGUID')
    .replace(/:fieldID/g, ':fieldID')
    .replace(/:profileID/g, ':profileID')
    .replace(/:eventFeeID/g, ':eventFeeID')
    .replace(/:reportID/g, ':reportID')
    .replace(/:catID/g, ':catID')
    .replace(/:logID/g, ':logID')
    .replace(/:grantID/g, ':grantID')
    .replace(/:awardID/g, ':awardID')
    .replace(/:sessionID/g, ':sessionID')
    .replace(/:promptID/g, ':promptID')
    .replace(/:templateID/g, ':templateID')
    .replace(/:sponsorLevelID/g, ':sponsorLevelID')
    .replace(/:slotRatingsConfigID/g, ':slotRatingsConfigID')
    .replace(/:resourceID/g, ':resourceID')
    .replace(/:resourceCategoryID/g, ':resourceCategoryID')
    .replace(/:mailType/g, ':mailType')
    .replace(/:id/g, ':id')
    .replace(/:status/g, ':status')
    .replace(/:format/g, ':format')
    .replace(/:reportType/g, ':reportType')
    .replace(/:idg/g, ':idg')
    .replace(/:refundAmount/g, ':refundAmount')
    .replace(/:login/g, ':login')
    .replace(/:key/g, ':key')
    .replace(/:payAmount/g, ':payAmount');
  
  const request = {
    name: route.name.replace(/Route$/, '').replace(/([A-Z])/g, ' $1').trim(),
    request: {
      method: route.method,
      header: headers,
      url: {
        raw: `{{baseUrl}}${urlPath}`,
        host: ['{{baseUrl}}'],
        path: urlPath.split('/').filter(p => p)
      }
    }
  };
  
  // Add body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
    request.request.body = {
      mode: 'raw',
      raw: '{}',
      options: {
        raw: {
          language: 'json'
        }
      }
    };
  }
  
  return request;
}

// Build collection items
for (const [categoryName, routes] of Object.entries(categories)) {
  if (routes.length === 0) continue;
  
  const categoryItem = {
    name: categoryName,
    item: routes.map(createRequestItem)
  };
  
  collection.item.push(categoryItem);
}

// Write collection file
const outputPath = path.join(__dirname, '../EventSquid_API.postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));

console.log(`Generated Postman collection with ${allRoutes.length} routes`);
console.log(`Collection saved to: ${outputPath}`);

