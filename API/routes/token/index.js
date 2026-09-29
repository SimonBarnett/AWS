// ====================== routes/token/index.js ======================
// Token / Auth Routes Sub-Router

const { logger, getDbConnection } = require('/opt/nodejs/helpers');

const loginRoute = require('./login');
const resetPasswordRoute = require('./reset-password');
const onboardingRoute = require('./onboarding');
const tosRoute = require('./tos');
const delegateRoute = require('../../delegate');
const networkRoute = require('./network');

module.exports = async (event, { sandbox = false } = {}) => {
    const path = event.path || '/';
    const method = (event.httpMethod || '').toUpperCase();

    logger.debug('Token router received request', { path, method });

    const pool = await getDbConnection();

    try {
        // === More specific routes first ===
        if (path.endsWith('/complete-signup') && method === 'POST') {
            return await onboardingRoute(event, { action: 'complete-signup', pool, sandbox });

        } else if (path.endsWith('/onboarding') && method === 'GET') {
            return await onboardingRoute(event, { action: 'complete', pool, sandbox });

        } else if (path.endsWith('/generate-onboarding-token') && method === 'POST') {
            return await onboardingRoute(event, { action: 'generate', pool, sandbox });

        } else if (path.endsWith('/validate-onboarding-token') && method === 'PUT') {
            return await onboardingRoute(event, { action: 'validate', pool, sandbox });

        } else if (path.endsWith('/reset-password') && method === 'POST') {
            return await resetPasswordRoute(event, { action: 'request', pool, sandbox });

        } else if (path.endsWith('/verify-reset-code') && method === 'POST') {
            return await resetPasswordRoute(event, { action: 'verify', pool, sandbox });

        } else if (path.endsWith('/tos') && method === 'GET') {
            return await tosRoute(event, { pool, sandbox });

        // === NEW: Public Network Route (unpassworded) ===
        } else if (path.endsWith('/network') && method === 'GET') {
            return await networkRoute(event);

        } else if (path.endsWith('/acceptdelegation') && method === 'POST') {
            return await delegateRoute(event, { action: 'accept', pool, sandbox });

        // === Generic login last ===
        } else if (path.endsWith('/login') && method === 'POST') {
            return await loginRoute(event, { pool, sandbox });

        } else {
            logger.warn('Token route not found', { path, method });
            return {
                statusCode: 404,
                body: { status: 'error', error_message: 'Route not found' }
            };
        }

    } catch (error) {
        logger.error('Error in token router', { path, error: error.message });
        return {
            statusCode: 500,
            body: { status: 'error', error_message: error.message || 'Internal Server Error' }
        };
    }
};