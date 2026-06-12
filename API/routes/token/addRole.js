// ====================== routes/token/addRole.js ======================
const { logger } = require('/opt/nodejs/helpers');
const { verifyJWT } = require('/opt/nodejs/jwt');

module.exports = async (event, { pool, sandbox = false } = {}) => {
    const body = event.body ? JSON.parse(event.body) : {};
    const { role, agreedToTos } = body;

    if (!role) {
        return { statusCode: 400, body: { status: 'error', error_message: 'role is required' } };
    }

    // In real implementation, update user roles in DB using passed pool + executeWithRetry

    if (sandbox) logger.debug('[SANDBOX] addRole called', { role });

    return {
        statusCode: 200,
        body: { status: 'success', message: `Role ${role} added (placeholder)` }
    };
};