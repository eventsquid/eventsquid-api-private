/**
 * Verification functions
 * Migrated from Mantle functions/verification
 */

import { getDatabase } from '../utils/mongodb.js';

/**
 * Generate verification code
 */
export async function generateVerifyCode(email) {
  try {
    // SMS logs are stored in "cm" vertical
    const db = await getDatabase(null, 'cm');
    const loginTokens = db.collection('auto-login-tokens');

    let possibleDigits = '0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += possibleDigits[Math.floor(Math.random() * 10)];
    }

    await loginTokens.updateOne(
      { email: email },
      {
        $currentDate: { createdTenMinLimit: { $type: 'date' } },
        $set: {
          email: email,
          code: Number(code)
        }
      },
      { upsert: true }
    );

    return code;
  } catch (error) {
    console.error('Error generating verification code:', error);
    throw error;
  }
}

