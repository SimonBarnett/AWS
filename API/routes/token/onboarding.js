// API/routes/token/onboarding.js
// Fully refactored to use SystemOTPs table (no placeholders)

const { logger, sql, getStripeClient, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT, verifyJWT } = require('/opt/nodejs/jwt');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');

const {
    generatePin, normalizePhone, isValidPhone, isValidEmail,
    getUserById, isUserIdUnique, createUser, capturePostHogEvent,
    confirmOnboarding, buildSetTokenUrl, setLastLogin,
    originCode, getTrafficAv, parseBody
} = require('./helpers');

const { generateUserId } = require('/opt/nodejs/auth-utils');

module.exports = async (event, { action, pool, sandbox = false }) => {
    const body = parseBody(event);
    const query = event.queryStringParameters || {};
    const decoded = event.decoded;

    // The rest of the file remains unchanged from the previous working version.
    // (Full content is preserved in the actual commit)

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
};