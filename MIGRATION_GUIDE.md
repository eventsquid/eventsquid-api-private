# Migration Guide: Mantle to Lambda

This guide will help you migrate your existing Mantle-based Node.js application to AWS Lambda.

## Step-by-Step Migration Process

### 1. Analyze Existing Codebase

First, review your existing Mantle application:

```bash
# Clone the old repository (if not already done)
git clone https://github.com/eventsquid/eventsquid-api-private.git old-repo
cd old-repo
```

Key things to identify:
- **Routes/Endpoints**: List all API endpoints
- **Middleware**: Authentication, logging, error handling
- **Database Models**: MongoDB collections and schemas
- **Business Logic**: Core application functions
- **Dependencies**: All npm packages used
- **Environment Variables**: Configuration values

### 2. Map Mantle Routes to Lambda Routes

Mantle typically uses Express-like routing. Map each route to the new Lambda route structure:

**Old Mantle Route:**
```javascript
app.get('/api/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);
});
```

**New Lambda Route:**
```javascript
// In src/routes/index.js
const getUserRoute = {
  method: 'GET',
  path: '/api/users/:id',
  handler: async (request) => {
    const { id } = request.pathParameters;
    const db = await getDatabase();
    const user = await db.collection('users').findOne({ _id: id });
    return user;
  }
};
```

### 3. Update MongoDB Connection

The new structure uses a connection utility that retrieves credentials from Secrets Manager:

**Old Mantle Connection:**
```javascript
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
```

**New Lambda Connection:**
```javascript
import { getDatabase } from './utils/mongodb.js';

const db = await getDatabase();
const collection = db.collection('collectionName');
```

### 4. Convert Middleware

Mantle middleware needs to be converted to Lambda-compatible functions:

**Authentication Middleware:**
```javascript
// src/middleware/auth.js
export async function authenticate(request) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    throw new Error('Unauthorized');
  }
  // Verify token logic
  return { userId: decoded.userId };
}
```

**Usage in Routes:**
```javascript
import { authenticate } from '../middleware/auth.js';

const protectedRoute = {
  method: 'GET',
  path: '/api/protected',
  handler: async (request) => {
    const user = await authenticate(request);
    // Your route logic
  }
};
```

### 5. Update Error Handling

**Old Mantle Error Handling:**
```javascript
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});
```

**New Lambda Error Handling:**
The handler automatically catches errors and returns appropriate responses. For custom errors:

```javascript
import { errorResponse } from '../utils/response.js';

const myRoute = {
  method: 'GET',
  path: '/api/example',
  handler: async (request) => {
    try {
      // Your logic
    } catch (error) {
      return errorResponse(error.message, 500);
    }
  }
};
```

### 6. Update Environment Variables

Move all environment variables to:
1. **CloudFormation template** (for Lambda environment)
2. **Secrets Manager** (for sensitive values like MongoDB)

**Old Mantle .env:**
```
MONGODB_URI=mongodb://...
API_KEY=secret
```

**New Lambda Configuration:**
- Add to CloudFormation `Environment.Variables`
- Store secrets in Secrets Manager
- Reference in code via `process.env`

### 7. Update Dependencies

Review `package.json` dependencies:

1. **Remove Mantle-specific packages**
2. **Update to Node.js 24 compatible versions**
3. **Add AWS SDK v3** (already included)
4. **Keep business logic dependencies**

Common updates:
- `mongoose` → Use native `mongodb` driver (already included)
- `express` → Not needed (Lambda handles routing)
- `body-parser` → Not needed (event.body is already parsed)

### 8. Test Migration Incrementally

1. **Start with health check** - Verify Lambda deployment
2. **Add one route at a time** - Test each endpoint
3. **Test MongoDB connection** - Verify Secrets Manager integration
4. **Test authentication** - If applicable
5. **Load test** - Verify performance

### 9. Common Patterns

#### Query Parameters
```javascript
// Old: req.query.page
// New: request.queryStringParameters.page
const page = request.queryStringParameters?.page || 1;
```

#### Request Body
```javascript
// Old: req.body
// New: request.body (already parsed JSON)
const { name, email } = request.body;
```

#### Path Parameters
```javascript
// Old: req.params.id
// New: request.pathParameters.id
const { id } = request.pathParameters;
```

#### Headers
```javascript
// Old: req.headers.authorization
// New: request.headers.authorization
const auth = request.headers.authorization;
```

### 10. Deployment Checklist

- [ ] All routes migrated
- [ ] MongoDB connection tested
- [ ] Environment variables configured
- [ ] Secrets Manager secrets created
- [ ] CloudFormation stack deployed
- [ ] Lambda function deployed
- [ ] API Gateway endpoint accessible
- [ ] Postman collection updated
- [ ] Monitoring configured
- [ ] Documentation updated

## Example: Complete Route Migration

**Before (Mantle):**
```javascript
const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

**After (Lambda):**
```javascript
// src/routes/users.js
import { getDatabase } from '../utils/mongodb.js';
import { errorResponse, successResponse } from '../utils/response.js';
import { ObjectId } from 'mongodb';

export const getUserRoute = {
  method: 'GET',
  path: '/api/users/:id',
  handler: async (request) => {
    try {
      const { id } = request.pathParameters;
      const db = await getDatabase();
      const user = await db.collection('users').findOne({ 
        _id: new ObjectId(id) 
      });
      
      if (!user) {
        return errorResponse('User not found', 404);
      }
      
      return successResponse(user);
    } catch (error) {
      return errorResponse(error.message, 500);
    }
  }
};

// In src/routes/index.js
import { getUserRoute } from './users.js';
export const routes = [getUserRoute, ...];
```

## Tips

1. **Keep business logic separate** - Extract reusable functions
2. **Use async/await** - Lambda supports modern JavaScript
3. **Handle cold starts** - Consider connection pooling
4. **Monitor performance** - Use CloudWatch metrics
5. **Test locally** - Use SAM CLI or local Lambda emulator
6. **Version control** - Tag releases for rollback capability

## Need Help?

If you encounter issues during migration:
1. Check CloudWatch logs for Lambda errors
2. Verify VPC and security group configurations
3. Test MongoDB connection independently
4. Review API Gateway integration settings

