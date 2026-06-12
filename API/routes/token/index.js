// API/routes/token/index.js
// Token / Auth Routes Sub-Router
// All handlers now receive { pool, sandbox } from here. No closes inside routes.

const { logger, getDbConnection } = require('/opt/nodejs/helpers');

// All token route handlers
const claimsRoute = require('./claims');
const loginRoute = require('./login');
const resetPasswordRoute = require('./reset-password');
const onboardingRoute = require('./onboarding');
const completeSignupRoute = require('./complete-signup');
const tosRoute = require('./tos');
const addRoleRoute = require('./addRole');
const delegateRoute = require('./delegate');
const deleteRoute = require('./delete');

module.exports = async (event) => {
    const path = event.path || '/';
    const method = (event.httpMethod || '').toUpperCase();

    logger.debug('Token router received request', { path, method });

    const pool = await getDbConnection();
    const sandbox = process.env.SANDBOX === 'true';

    try {
        if (path === '/login/claims' && method === 'GET') {
            return await claimsRoute(event, { pool, sandbox });

        } else if (path === '/login' && method === 'POST') {
            return await loginRoute(event, { pool, sandbox });

        } else if (path === '/login/reset-password' && method === 'POST') {
            return await resetPasswordRoute(event, { action: 'request', pool, sandbox });

        } else if (path === '/login/verify-reset-code' && method === 'POST') {
            return await resetPasswordRoute(event, { action: 'verify', pool, sandbox });

        } else if (path === '/login/onboarding' && method === 'GET') {
            return await onboardingRoute(event, { action: 'complete', pool, sandbox });

        } else if (path === '/login/complete-signup' && method === 'POST') {
            return await onboardingRoute(event, { action: 'complete-signup', pool, sandbox });

        } else if (path === '/login/tos' && method === 'GET') {
            return await tosRoute(event, { pool, sandbox });

        } else if (path === '/login/add-role' && method === 'POST') {
            return await addRoleRoute(event, { pool, sandbox });

        } else if (path === '/login/generate-onboarding-token' && method === 'POST') {
            return await onboardingRoute(event, { action: 'generate', pool, sandbox });

        } else if (path === '/login/validate-onboarding-token' && method === 'PUT') {
            return await onboardingRoute(event, { action: 'validate', pool, sandbox });

        } else if (path === '/login/delegate' && method === 'POST') {
            return await delegateRoute(event, { action: 'initiate', pool, sandbox });

        } else if (path === '/login/acceptdelegation' && method === 'POST') {
            return await delegateRoute(event, { action: 'accept', pool, sandbox });

        } else if (path === '/login/delete' && method === 'POST') {
            return await deleteRoute(event, { action: 'initiate', pool, sandbox });

        } else if (path === '/login/deleteconfirm' && method === 'POST') {
            return await deleteRoute(event, { action: 'confirm', pool, sandbox });

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
    } finally {
        if (pool) await pool.close();
    }
};