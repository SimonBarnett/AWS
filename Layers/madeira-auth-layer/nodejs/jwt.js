// nodejs/jwt.js
// JWT signing and verification - uses shared helpers from core layer

const jwt = require('jsonwebtoken');
const { getJwtConfig, logger } = require('/opt/nodejs/helpers');

/**
 * Sign a JWT token
 * @param {object} payload - Data to encode in the token
 * @param {object} options - Additional jwt.sign options
 * @returns {Promise<string>} Signed JWT token
 */
async function signJWT(payload, options = {}) {
    const transactionId = `jwt-sign-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
        const config = await getJwtConfig();

        if (!config.JWT_SECRET_KEY || config.JWT_SECRET_KEY === "CHANGE_ME") {
            logger.error('JWT signing failed - secret key not configured', { transactionId });
            throw new Error('JWT_SECRET_KEY is not configured. Please set it in SSM or environment variables.');
        }

        const token = jwt.sign(payload, config.JWT_SECRET_KEY, {
            algorithm: 'HS256',
            ...options
        });

        logger.debug('🔑 JWT signed successfully', { 
            transactionId,
            payloadKeys: Object.keys(payload)
        });

        return token;
    } catch (error) {
        logger.error('❌ JWT signing failed', { 
            transactionId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<object>} Decoded payload
 */
async function verifyJWT(token) {
    const transactionId = `jwt-verify-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
        const config = await getJwtConfig();

        if (!config.JWT_SECRET_KEY || config.JWT_SECRET_KEY === "CHANGE_ME") {
            logger.error('JWT verification failed - secret key not configured', { transactionId });
            throw new Error('JWT_SECRET_KEY is not configured. Please set it in SSM or environment variables.');
        }

        const decoded = jwt.verify(token, config.JWT_SECRET_KEY, { 
            algorithms: ['HS256'] 
        });

        logger.debug('🔑 JWT verified successfully', { 
            transactionId,
            userId: decoded.user_id || decoded.id || 'unknown'
        });

        return decoded;
    } catch (error) {
        logger.error('❌ JWT verification failed', { 
            transactionId,
            error: error.message,
            name: error.name
        });
        throw error; // Let caller handle invalid/expired tokens
    }
}

module.exports = { signJWT, verifyJWT };

logger.info('✅ JWT module loaded successfully');