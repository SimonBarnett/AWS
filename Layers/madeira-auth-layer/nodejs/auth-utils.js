// nodejs/auth-utils.js
// User ID generation & validation utilities - Auth Layer

const { logger } = require('/opt/nodejs/helpers');   // ← FIXED: correct Lambda Layers path

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generate a unique 8-character User ID (7 random + checksum)
 * Format: 7 alphanumeric chars + 1 checksum char
 * @returns {string} 8-character User ID
 */
function generateUserId() {
    const transactionId = `gen-userid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let code = '';
    for (let i = 0; i < 7; i++) {
        const randomIndex = Math.floor(Math.random() * CHARSET.length);
        code += CHARSET[randomIndex];
    }

    let total = 0;
    for (let char of code) {
        total += CHARSET.indexOf(char);
    }
    const checksum = CHARSET[total % 36];

    const userId = code + checksum;

    logger.debug('🔑 Generated new User ID', { transactionId, userId });
    return userId;
}

/**
 * Validate a Madeira User ID (checks length and checksum)
 * @param {string} userId - The User ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateUserId(userId) {
    const transactionId = `validate-userid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (!userId || typeof userId !== 'string' || userId.length !== 8) {
        logger.debug('❌ User ID validation failed - invalid format', { transactionId, userId });
        return false;
    }

    const code = userId.slice(0, 7);
    const providedChecksum = userId[7];

    let total = 0;
    for (let char of code) {
        total += CHARSET.indexOf(char);
    }
    const expectedChecksum = CHARSET[total % 36];

    const isValid = providedChecksum === expectedChecksum;

    logger.debug(`🔑 User ID validation ${isValid ? 'passed' : 'failed'}`, { 
        transactionId, 
        userId,
        expectedChecksum 
    });

    return isValid;
}

module.exports = { 
    generateUserId, 
    validateUserId 
};

logger.info('✅ Auth utilities loaded (User ID generation + validation)');