/**
 * System functions
 * Migrated from Mantle functions/system
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import _ from 'lodash';

/**
 * Get available gateways from global vars
 */
export async function getAvailableGateways(vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
      USE ${dbName};
      SELECT attribute_valueText AS gatewayList
      FROM a_globalVars
      WHERE attribute_name = 'payMethod'
    `)
    .execute();

    if (!results || !results.length || !results[0].gatewayList) {
      return [];
    }

    const gatewaysRA = results[0].gatewayList.split(',').map(gw => gw.trim());

    // Transform gateways to objects with default values
    const transformedGateways = gatewaysRA.map(gateway => {
      const gwLower = gateway.toLowerCase();

      if (gwLower === 'authnet') {
        return {
          pm: 'authnet',
          name: 'Authorize.Net',
          auth_testMode: 0,
          auth_visaCheckout: 0,
          auth_iFrame: 0,
          auth_transactionKey: '',
          auth_APILogin: '',
          auth_sandbox: false,
          isDefault: false,
          auth_cardCode: 1,
          auth_bankAccount: false,
          auth_billAddressAsk: true,
          auth_billAddressReq: true,
          auth_shipAddressAsk: true,
          auth_shipAddressReq: false,
          auth_emailAddressAsk: false,
          auth_emailAddressReq: false,
          auth_captcha: false
        };
      } else if (gwLower === 'paypalexpress') {
        return {
          pm: 'paypalexpress',
          name: 'PayPal Express',
          paypalExpressAPIUser: '',
          paypalExpressAPIPwd: '',
          paypalExpressAPISignature: '',
          isDefault: false
        };
      } else if (gwLower === 'paypalpayflow') {
        return {
          pm: 'paypalpayflow',
          name: 'PayPal Payflow',
          paypalPayflowVendor: '',
          paypalPayflowPwd: '',
          paypalPayflowUser: '',
          paypalPayflowPartner: '',
          paypalPayflowTestMode: 0,
          isDefault: false
        };
      } else if (gwLower === 'payzang') {
        return {
          pm: 'payzang',
          name: 'PayZang',
          payZangTokenizationKey: '',
          payZangSecurityKey: '',
          isDefault: false
        };
      } else if (gwLower === 'stripe') {
        return {
          pm: 'stripe',
          name: 'Stripe',
          stripeAccessToken: '',
          stripeLiveMode: 0,
          stripeRefreshToken: '',
          stripeScope: '',
          stripePublishableKey: '',
          stripeUserID: '',
          stripeTokenType: '',
          stripeReqBillingAdd: 0,
          isDefault: false
        };
      } else if (gwLower === 'vantiv-worldpay') {
        return {
          pm: 'vantiv-worldpay',
          name: 'Vantiv-Worldpay',
          vwApplicationID: '',
          vwAcceptorID: '',
          vwAccountToken: '',
          vwAccountID: '',
          isDefault: false
        };
      }

      return null;
    }).filter(Boolean);

    return transformedGateways;
  } catch (error) {
    console.error('Error getting available gateways:', error);
    throw error;
  }
}

