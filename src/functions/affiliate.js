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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      IF NOT EXISTS (
        SELECT affiliate_id FROM affiliateMerchant WHERE affiliate_id = @affiliateID
      )
      BEGIN
        INSERT INTO affiliateMerchant (affiliate_id) VALUES (@affiliateID)
      END
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
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
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
      // In the future, we would call updateStripeConfigMongo, updateAuthNetConfigMongo, etc.
      console.log('Missing gateways in MongoDB, sync needed:', missingRA);
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      UPDATE affiliateMerchant
      SET payMethod = NULL
      WHERE affiliate_id = @affiliateID
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);
      const db = await getDatabase(null, vert);
      const gateways = db.collection('gateways');

      // Update payMethod in SQL
      await connection.sql(`
        USE ${dbName};
        UPDATE affiliateMerchant
        SET payMethod = ''
        WHERE affiliate_id = @affiliateID
      `)
      .parameter('affiliateID', TYPES.Int, Number(affiliateID))
      .execute();

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
 * Update gateway (updates MongoDB gateways collection)
 */
export async function updateGateway(affiliateID, gatewayID, form, vert) {
  try {
    if (Number(affiliateID) > 0) {
      // Set isDefault to false for all gateways if current gateway is set to default
      await updateGatewayDefaults(affiliateID, form.isDefault, vert);

      const db = await getDatabase(null, vert);
      const gateways = db.collection('gateways');

      // Map gatewayID to payment method
      const gatewayMap = {
        'stripe': 'Stripe',
        'authnet': 'AuthNet',
        'paypalexpress': 'PayPalExpress',
        'paypalpayflow': 'PayPalPayflow',
        'payzang': 'PayZang',
        'vantiv-worldpay': 'Vantiv-Worldpay'
      };

      const pm = gatewayMap[gatewayID.toLowerCase()] || gatewayID;

      // Update gateway in MongoDB
      const updateObj = {
        $currentDate: { lu: { $type: 'date' } },
        $set: {
          ...form,
          isDefault: form.isDefault || false,
          a: Number(affiliateID),
          pm: pm
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

      // If this is set as default, update MSSQL payMethod
      if (form.isDefault) {
        const connection = await getConnection(vert);
        const dbName = getDatabaseName(vert);
        await connection.sql(`
          USE ${dbName};
          UPDATE affiliateMerchant
          SET payMethod = @payMethod
          WHERE affiliate_id = @affiliateID
        `)
        .parameter('affiliateID', TYPES.Int, Number(affiliateID))
        .parameter('payMethod', TYPES.VarChar, gatewayID.toLowerCase())
        .execute();
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
      const connection = await getConnection(vert);
      const dbName = getDatabaseName(vert);

      // Map gatewayID to payment method
      const gatewayMap = {
        'stripe': 'Stripe',
        'authnet': 'AuthNet',
        'paypalexpress': 'PayPalExpress',
        'paypalpayflow': 'PayPalPayflow',
        'payzang': 'PayZang',
        'vantiv-worldpay': 'Vantiv-Worldpay'
      };

      const pm = gatewayMap[gatewayID.toLowerCase()] || gatewayID;

      // Check if this was the default gateway before deleting
      const gateway = await gateways.findOne({
        a: Number(affiliateID),
        pm: pm,
        isDeleted: { $exists: false }
      });

      // Mark gateway as deleted in MongoDB
      await gateways.updateOne(
        {
          a: Number(affiliateID),
          pm: pm,
          isDeleted: { $exists: false }
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
        await connection.sql(sqlQry)
          .parameter('affiliateID', TYPES.Int, Number(affiliateID))
          .execute();
      }

      return { success: true, gatewayID, message: 'Gateway deleted successfully' };
    }
    return { success: false, message: 'Invalid affiliate ID' };
  } catch (error) {
    console.error('Error deleting gateway:', error);
    throw error;
  }
}

