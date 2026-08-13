/**
 * Affiliate functions
 * Migrated from Mantle functions/affiliate
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { getDatabase } from '../utils/mongodb.js';
import _ from 'lodash';

/**
 * Populate affiliate merchant record if it doesn't exist
 */
export async function populateAffMerchant(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    await request.query(`
      USE ${dbName};
      IF NOT EXISTS (
        SELECT affiliate_id FROM affiliateMerchant WHERE affiliate_id = @affiliateID
      )
      BEGIN
        INSERT INTO affiliateMerchant (affiliate_id) VALUES (@affiliateID)
      END
    `);
  } catch (error) {
    console.error('Error populating affiliate merchant:', error);
    throw error;
  }
}

/**
 * Get gateways from SQL
 */
export async function getGatewaysSQL(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      SELECT
        payMethod,
        stripeAccessToken,
        stripeLiveMode,
        stripeRefreshToken,
        stripeScope,
        stripePublishableKey,
        stripeUserID,
        stripeTokenType,
        stripeReqBillingAdd,
        paypalExpressAPIUser,
        paypalExpressAPIPwd,
        paypalExpressAPISignature,
        paypalPayflowVendor,
        paypalPayflowPwd,
        paypalPayflowUser,
        paypalPayflowPartner,
        paypalPayflowTestMode,
        payZangTokenizationKey,
        payZangSecurityKey,
        vwApplicationID,
        vwAcceptorID,
        vwAccountToken,
        vwAccountID,
        [auth_testMode],
        [auth_visaCheckout],
        [auth_iFrame],
        [auth_transactionKey],
        [auth_APILogin],
        [auth_sandbox]
      FROM affiliateMerchant
      WHERE affiliate_id = @affiliateID
    `);
    const results = result.recordset;

    if (!results || !results.length) {
      return { gatewaysRA: [], enabledGatwaysRA: [] };
    }

    const sqlObj = results[0];
    const gatewaysRA = [];
    const enabledGatwaysRA = [];

    // AuthNet
    if (_.trim(sqlObj.auth_APILogin) !== '') {
      enabledGatwaysRA.push('authnet');
      gatewaysRA.push({
        name: 'Authorize.Net',
        auth_testMode: Number(sqlObj.auth_testMode),
        auth_visaCheckout: Number(sqlObj.auth_visaCheckout),
        auth_iFrame: Number(sqlObj.auth_iFrame),
        auth_transactionKey: _.trim(sqlObj.auth_transactionKey),
        auth_APILogin: _.trim(sqlObj.auth_APILogin),
        auth_sandbox: Boolean(sqlObj.auth_sandbox),
        isDefault: sqlObj.payMethod && sqlObj.payMethod.toLowerCase() === 'authnet'
      });
    }

    // PayPal Express
    if (_.trim(sqlObj.paypalExpressAPIUser) !== '') {
      enabledGatwaysRA.push('paypalexpress');
      gatewaysRA.push({
        name: 'PayPal Express',
        paypalExpressAPIUser: _.trim(sqlObj.paypalExpressAPIUser),
        paypalExpressAPIPwd: _.trim(sqlObj.paypalExpressAPIPwd),
        paypalExpressAPISignature: _.trim(sqlObj.paypalExpressAPISignature),
        isDefault: sqlObj.payMethod && sqlObj.payMethod.toLowerCase() === 'paypalexpress'
      });
    }

    // PayPal Payflow
    if (_.trim(sqlObj.paypalPayflowUser) !== '') {
      enabledGatwaysRA.push('paypalpayflow');
      gatewaysRA.push({
        name: 'PayPal Payflow',
        paypalPayflowVendor: _.trim(sqlObj.paypalPayflowVendor),
        paypalPayflowPwd: _.trim(sqlObj.paypalPayflowPwd),
        paypalPayflowUser: _.trim(sqlObj.paypalPayflowUser),
        paypalPayflowPartner: _.trim(sqlObj.paypalPayflowPartner),
        paypalPayflowTestMode: sqlObj.paypalPayflowTestMode,
        isDefault: sqlObj.payMethod && sqlObj.payMethod.toLowerCase() === 'paypalpayflow'
      });
    }

    // PayZang
    if (_.trim(sqlObj.payZangTokenizationKey) !== '') {
      enabledGatwaysRA.push('payzang');
      gatewaysRA.push({
        name: 'PayZang',
        payZangTokenizationKey: _.trim(sqlObj.payZangTokenizationKey),
        payZangSecurityKey: _.trim(sqlObj.payZangSecurityKey),
        isDefault: sqlObj.payMethod && sqlObj.payMethod.toLowerCase() === 'payzang'
      });
    }

    // Stripe
    if (_.trim(sqlObj.stripeUserID) !== '') {
      enabledGatwaysRA.push('stripe');
      gatewaysRA.push({
        name: 'Stripe',
        stripeAccessToken: _.trim(sqlObj.stripeAccessToken),
        stripeLiveMode: Number(sqlObj.stripeLiveMode),
        stripeRefreshToken: _.trim(sqlObj.stripeRefreshToken),
        stripeScope: _.trim(sqlObj.stripeScope),
        stripePublishableKey: _.trim(sqlObj.stripePublishableKey),
        stripeUserID: _.trim(sqlObj.stripeUserID),
        stripeTokenType: _.trim(sqlObj.stripeTokenType),
        stripeReqBillingAdd: Number(sqlObj.stripeReqBillingAdd),
        isDefault: sqlObj.payMethod && sqlObj.payMethod.toLowerCase() === 'stripe'
      });
    }

    // Vantiv-Worldpay
    if (_.trim(sqlObj.vwApplicationID) !== '') {
      enabledGatwaysRA.push('vantiv-worldpay');
      gatewaysRA.push({
        name: 'Vantiv-Worldpay',
        vwApplicationID: _.trim(sqlObj.vwApplicationID),
        vwAcceptorID: _.trim(sqlObj.vwAcceptorID),
        vwAccountToken: _.trim(sqlObj.vwAccountToken),
        vwAccountID: _.trim(sqlObj.vwAccountID),
        isDefault: sqlObj.payMethod && sqlObj.payMethod.toLowerCase() === 'vantiv-worldpay'
      });
    }

    return {
      gatewaysRA: gatewaysRA,
      enabledGatwaysRA: enabledGatwaysRA.sort()
    };
  } catch (error) {
    console.error('Error getting gateways from SQL:', error);
    throw error;
  }
}

/**
 * Get gateways from MongoDB
 */
export async function getGatewaysMongo(affiliateID, vert) {
  try {
    const db = await getDatabase(null, vert);
    const gateways = db.collection('gateways');

    const gatewaysRA = await gateways.find({
      a: Number(affiliateID),
      isDeleted: { $exists: false }
    }).toArray();

    const enabledGatwaysRA = gatewaysRA.map(gw => gw.pm?.toLowerCase()).filter(Boolean);

    return {
      gatewaysRA: gatewaysRA,
      enabledGatwaysRA: enabledGatwaysRA.sort()
    };
  } catch (error) {
    console.error('Error getting gateways from MongoDB:', error);
    throw error;
  }
}

/**
 * Get gateways (combines SQL and MongoDB, syncs if needed)
 */
export async function getGateways(affiliateID, vert) {
  try {
    const sqlObj = await getGatewaysSQL(affiliateID, vert);
    let mongoObj = await getGatewaysMongo(affiliateID, vert);

    const missingRA = _.difference(sqlObj.enabledGatwaysRA, mongoObj.enabledGatwaysRA);

    // If we are missing any gateways from Mongo, sync them
    if (missingRA.length > 0) {
      // TODO: Implement gateway-specific MongoDB sync functions
      // For now, just return the SQL gateways
    }

    return mongoObj.gatewaysRA.length > 0 ? mongoObj.gatewaysRA : sqlObj.gatewaysRA;
  } catch (error) {
    console.error('Error getting gateways:', error);
    throw error;
  }
}

/**
 * Reset payment processor
 */
export async function resetPaymentProcessor(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    await request.query(`
      USE ${dbName};
      UPDATE affiliateMerchant
      SET payMethod = NULL
      WHERE affiliate_id = @affiliateID
    `);

    return { success: true };
  } catch (error) {
    console.error('Error resetting payment processor:', error);
    throw error;
  }
}

/**
 * Update gateway defaults
 */
export async function updateGatewayDefaults(affiliateID, isDefault, vert) {
  try {
    if (Number(affiliateID) > 0 && isDefault) {
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const gateways = db.collection('gateways');

      // Update payMethod in SQL
      const request = new sql.Request();
      request.input('affiliateID', sql.Int, Number(affiliateID));
      await request.query(`
        USE ${dbName};
        UPDATE affiliateMerchant
        SET payMethod = ''
        WHERE affiliate_id = @affiliateID
      `);

      // Set all gateway defaults to false in MongoDB
      await gateways.updateMany(
        { a: Number(affiliateID) },
        { $set: { isDefault: false } }
      );
    }
  } catch (error) {
    console.error('Error updating gateway defaults:', error);
    throw error;
  }
}

/**
 * Update gateway (updates MongoDB gateways collection and syncs to MSSQL affiliateMerchant)
 */
export async function updateGateway(affiliateID, gatewayID, form, vert) {
  try {
    if (Number(affiliateID) > 0) {
      // Set isDefault to false for all gateways if current gateway is set to default
      await updateGatewayDefaults(affiliateID, form.isDefault, vert);

      const db = await getDatabase(null, vert);
      const gateways = db.collection('gateways');

      // Map gatewayID to payment method
      // Note: PayZang and Vantiv use lowercase in MongoDB (matching old codebase)
      // Stripe and others use capitalized format
      const gatewayMap = {
        'stripe': 'Stripe',
        'authnet': 'AuthNet',
        'paypalexpress': 'PayPalExpress',
        'paypalpayflow': 'PayPalPayflow',
        'payzang': 'payzang',  // Lowercase to match existing MongoDB documents
        'vantiv-worldpay': 'vantiv-worldpay'  // Lowercase to match existing MongoDB documents
      };

      const pm = gatewayMap[gatewayID.toLowerCase()] || gatewayID;

      // Update gateway in MongoDB
      // Exclude fields that we set explicitly or shouldn't be updated
      // Note: 'pm' is already declared above, so we exclude it from form without destructuring it
      const { lu, a: aFromForm, pm: pmFromForm, _id, initialIsDefault, isNew, ...formWithoutExcluded } = form;
      
      // Explicitly remove any remaining instances of excluded fields to prevent conflicts
      delete formWithoutExcluded.lu;
      delete formWithoutExcluded.a;
      delete formWithoutExcluded.pm;
      delete formWithoutExcluded._id;
      delete formWithoutExcluded.initialIsDefault;  // Exclude initialIsDefault - it's only used for UI state
      delete formWithoutExcluded.isNew;  // Exclude isNew - it's only used for UI state to track if gateway is new
      
      const updateObj = {
        $currentDate: { lu: { $type: 'date' } },
        $set: {
          ...formWithoutExcluded,
          isDefault: form.isDefault || false
        },
        $setOnInsert: {
          a: Number(affiliateID),
          pm: pm
        }
      };

      await gateways.updateOne(
        {
          a: Number(affiliateID),
          pm: pm,
          isDeleted: { $exists: false }
        },
        updateObj,
        { upsert: true }
      );

      // Sync gateway-specific credential fields to MSSQL affiliateMerchant table
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      await populateAffMerchant(affiliateID, vert);

      const request = new sql.Request();
      request.input('affiliateID', sql.Int, Number(affiliateID));

      const updateFields = [];
      const gwType = gatewayID.toLowerCase();

      if (gwType === 'authnet') {
        request.input('auth_APILogin', sql.VarChar, form.auth_APILogin || '');
        request.input('auth_transactionKey', sql.VarChar, form.auth_transactionKey || '');
        request.input('auth_testMode', sql.Int, Number(form.auth_testMode) || 0);
        request.input('auth_visaCheckout', sql.Int, Number(form.auth_visaCheckout) || 0);
        request.input('auth_iFrame', sql.Int, Number(form.auth_iFrame) || 0);
        request.input('auth_sandbox', sql.Bit, form.auth_sandbox ? 1 : 0);
        updateFields.push(
          '[auth_APILogin] = @auth_APILogin',
          '[auth_transactionKey] = @auth_transactionKey',
          '[auth_testMode] = @auth_testMode',
          '[auth_visaCheckout] = @auth_visaCheckout',
          '[auth_iFrame] = @auth_iFrame',
          '[auth_sandbox] = @auth_sandbox'
        );
      } else if (gwType === 'stripe') {
        request.input('stripeAccessToken', sql.VarChar, form.stripeAccessToken || '');
        request.input('stripeLiveMode', sql.Int, Number(form.stripeLiveMode) || 0);
        request.input('stripeRefreshToken', sql.VarChar, form.stripeRefreshToken || '');
        request.input('stripeScope', sql.VarChar, form.stripeScope || '');
        request.input('stripePublishableKey', sql.VarChar, form.stripePublishableKey || '');
        request.input('stripeUserID', sql.VarChar, form.stripeUserID || '');
        request.input('stripeTokenType', sql.VarChar, form.stripeTokenType || '');
        request.input('stripeReqBillingAdd', sql.Int, Number(form.stripeReqBillingAdd) || 0);
        updateFields.push(
          'stripeAccessToken = @stripeAccessToken',
          'stripeLiveMode = @stripeLiveMode',
          'stripeRefreshToken = @stripeRefreshToken',
          'stripeScope = @stripeScope',
          'stripePublishableKey = @stripePublishableKey',
          'stripeUserID = @stripeUserID',
          'stripeTokenType = @stripeTokenType',
          'stripeReqBillingAdd = @stripeReqBillingAdd'
        );
      } else if (gwType === 'paypalexpress') {
        request.input('paypalExpressAPIUser', sql.VarChar, form.paypalExpressAPIUser || '');
        request.input('paypalExpressAPIPwd', sql.VarChar, form.paypalExpressAPIPwd || '');
        request.input('paypalExpressAPISignature', sql.VarChar, form.paypalExpressAPISignature || '');
        updateFields.push(
          'paypalExpressAPIUser = @paypalExpressAPIUser',
          'paypalExpressAPIPwd = @paypalExpressAPIPwd',
          'paypalExpressAPISignature = @paypalExpressAPISignature'
        );
      } else if (gwType === 'paypalpayflow') {
        request.input('paypalPayflowVendor', sql.VarChar, form.paypalPayflowVendor || '');
        request.input('paypalPayflowPwd', sql.VarChar, form.paypalPayflowPwd || '');
        request.input('paypalPayflowUser', sql.VarChar, form.paypalPayflowUser || '');
        request.input('paypalPayflowPartner', sql.VarChar, form.paypalPayflowPartner || '');
        request.input('paypalPayflowTestMode', sql.Int, Number(form.paypalPayflowTestMode) || 0);
        updateFields.push(
          'paypalPayflowVendor = @paypalPayflowVendor',
          'paypalPayflowPwd = @paypalPayflowPwd',
          'paypalPayflowUser = @paypalPayflowUser',
          'paypalPayflowPartner = @paypalPayflowPartner',
          'paypalPayflowTestMode = @paypalPayflowTestMode'
        );
      } else if (gwType === 'payzang') {
        request.input('payZangTokenizationKey', sql.VarChar, form.payZangTokenizationKey || '');
        request.input('payZangSecurityKey', sql.VarChar, form.payZangSecurityKey || '');
        updateFields.push(
          'payZangTokenizationKey = @payZangTokenizationKey',
          'payZangSecurityKey = @payZangSecurityKey'
        );
      } else if (gwType === 'vantiv-worldpay') {
        request.input('vwApplicationID', sql.VarChar, form.vwApplicationID || '');
        request.input('vwAcceptorID', sql.VarChar, form.vwAcceptorID || '');
        request.input('vwAccountToken', sql.VarChar, form.vwAccountToken || '');
        request.input('vwAccountID', sql.VarChar, form.vwAccountID || '');
        updateFields.push(
          'vwApplicationID = @vwApplicationID',
          'vwAcceptorID = @vwAcceptorID',
          'vwAccountToken = @vwAccountToken',
          'vwAccountID = @vwAccountID'
        );
      }

      if (form.isDefault) {
        request.input('payMethod', sql.VarChar, gwType);
        updateFields.push('payMethod = @payMethod');
      }

      if (updateFields.length > 0) {
        await request.query(`
          USE ${dbName};
          UPDATE affiliateMerchant
          SET ${updateFields.join(', ')}
          WHERE affiliate_id = @affiliateID
        `);
      }

      return { success: true, gatewayID, message: 'Gateway updated successfully' };
    }
    return { success: false, message: 'Invalid affiliate ID' };
  } catch (error) {
    console.error('Error updating gateway:', error);
    throw error;
  }
}

/**
 * Delete gateway (marks as deleted in MongoDB and clears MSSQL fields)
 */
export async function deleteGateway(affiliateID, gatewayID, vert) {
  try {
    if (Number(affiliateID) > 0) {
      const db = await getDatabase(null, vert);
      const gateways = db.collection('gateways');
      const sql = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Map gatewayID to payment method
      // Note: PayZang and Vantiv use lowercase in MongoDB (matching old codebase)
      // Stripe and others use capitalized format
      const gatewayMap = {
        'stripe': 'Stripe',
        'authnet': 'AuthNet',
        'paypalexpress': 'PayPalExpress',
        'paypalpayflow': 'PayPalPayflow',
        'payzang': 'payzang',  // Lowercase to match existing MongoDB documents
        'vantiv-worldpay': 'vantiv-worldpay'  // Lowercase to match existing MongoDB documents
      };

      const pm = gatewayMap[gatewayID.toLowerCase()] || gatewayID;

      // Check if this was the default gateway before deleting
      const gateway = await gateways.findOne({
        a: Number(affiliateID),
        pm: pm,
        isDeleted: { $exists: false }
      });

      // Mark gateway as deleted in MongoDB
      // Match old behavior: use updateMany (old code didn't check isDeleted in the query)
      await gateways.updateMany(
        {
          a: Number(affiliateID),
          pm: pm
        },
        {
          $set: { isDeleted: true },
          $currentDate: { lu: { $type: 'date' } }
        }
      );

      // Clear MSSQL gateway-specific fields based on gateway type
      let sqlQry = `USE ${dbName}; UPDATE affiliateMerchant SET `;
      const updateFields = [];

      if (gatewayID.toLowerCase() === 'authnet') {
        updateFields.push(
          '[auth_testMode] = NULL',
          '[auth_visaCheckout] = NULL',
          '[auth_iFrame] = NULL',
          '[auth_transactionKey] = NULL',
          '[auth_APILogin] = NULL',
          '[auth_sandbox] = 0'
        );
      } else if (gatewayID.toLowerCase() === 'stripe') {
        updateFields.push(
          'stripeAccessToken = NULL',
          'stripeLiveMode = NULL',
          'stripeRefreshToken = NULL',
          'stripeScope = NULL',
          'stripePublishableKey = NULL',
          'stripeUserID = NULL',
          'stripeTokenType = NULL',
          'stripeReqBillingAdd = NULL'
        );
      } else if (gatewayID.toLowerCase() === 'paypalexpress') {
        updateFields.push(
          'paypalExpressAPIUser = NULL',
          'paypalExpressAPIPwd = NULL',
          'paypalExpressAPISignature = NULL'
        );
      } else if (gatewayID.toLowerCase() === 'paypalpayflow') {
        updateFields.push(
          'paypalPayflowVendor = NULL',
          'paypalPayflowPwd = NULL',
          'paypalPayflowUser = NULL',
          'paypalPayflowPartner = NULL',
          'paypalPayflowTestMode = NULL'
        );
      } else if (gatewayID.toLowerCase() === 'payzang') {
        updateFields.push(
          'payZangTokenizationKey = NULL',
          'payZangSecurityKey = NULL'
        );
      } else if (gatewayID.toLowerCase() === 'vantiv-worldpay') {
        updateFields.push(
          'vwApplicationID = NULL',
          'vwAcceptorID = NULL',
          'vwAccountToken = NULL',
          'vwAccountID = NULL'
        );
      }

      // If this was the default gateway, clear payMethod
      if (gateway && gateway.isDefault) {
        updateFields.push('payMethod = NULL');
      }

      if (updateFields.length > 0) {
        sqlQry += updateFields.join(', ') + ' WHERE affiliate_id = @affiliateID';
        const request = new sql.Request();
        request.input('affiliateID', sql.Int, Number(affiliateID));
        await request.query(sqlQry);
      }

      // Match old behavior: don't return anything (old code returns undefined)
    }
  } catch (error) {
    console.error('Error deleting gateway:', error);
    throw error;
  }
}

/**
 * Get all users associated with an affiliate (admins/contacts).
 * Used to determine whether a user has affiliate-level access to an event.
 */
export async function getAffiliateUsers(affiliateID, vert) {
  const sql = await getConnection(vert);
  const dbName = getDatabaseName(vert);

  const request = new sql.Request();
  request.input('affiliateID', TYPES.Int, Number(affiliateID));
  const result = await request.query(`
    USE ${dbName};
    SELECT
      u.user_id,
      u.user_firstname,
      u.user_lastname,
      u.user_email,
      u.user_phone,
      u.user_mobile,
      ua.*
    FROM b_users u
    INNER JOIN user_affiliate ua ON ua.user_id = u.user_id
    WHERE ua.affiliate_id = @affiliateID
  `);
  return result.recordset;
}

