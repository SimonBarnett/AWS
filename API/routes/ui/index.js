// ====================== routes/ui/index.js ======================
// UI Routes Sub-Router
// Creates one pool per request and passes { pool, sandbox } to all handlers

// IMPORTANT: Do NOT close the pool here. It is passed from the main orchestrator.

const { logger, getDbConnection } = require('/opt/nodejs/helpers');

const cmsProvidersHandler = require('./cmsProviders');
const apiKeysHandler = require('./apiKeys');
const metricsHandler = require('./metrics');
const chartDataHandler = require('./chartData');
const merchantPartsHandler = require('./merchantParts');
const categoryHandler = require('./category');
const resetHandler = require('./reset');
const deleteHandler = require('./delete');
const addRoleHandler = require('./addRole');
const inviteHandler = require('./invite').handler;

module.exports = async (event) => {
    // Normalize path (remove /ui prefix if present)
    let path = event.path || '/';

    if (path.startsWith('/ui')) {
        path = path.replace(/^\/ui/, '');
    }

    if (!path.startsWith('/')) {
        path = '/' + path;
    }

    event.path = path;

    const method = event.httpMethod;
    const decoded = event.decoded;

    logger.debug('UI Router received request', {
        originalPath: event.path,
        normalizedPath: path,
        method
    });

    const pool = await getDbConnection();
    const sandbox = process.env.SANDBOX === 'true';

    try {
        // === Routes with sub-paths (use startsWith) ===
        if (path.startsWith('/cms-providers')) {
            return await cmsProvidersHandler(event, { pool, sandbox });

        } else if (path.startsWith('/api-keys')) {
            return await apiKeysHandler(event, { pool, sandbox });

        } else if (path.startsWith('/delete')) {
            return await deleteHandler(event, { pool, sandbox });

        // === Leaf routes (use endsWith for robustness) ===
        } else if (path.endsWith('/metrics') && method === 'GET') {
            return await metricsHandler(event, { pool, sandbox });

        } else if (path.endsWith('/chart-data') && method === 'GET') {
            return await chartDataHandler(event, { pool, sandbox });

        } else if (path.endsWith('/merchant-parts') && method === 'GET') {
            return await merchantPartsHandler(event, { pool, sandbox });

        } else if (path.endsWith('/category') && (method === 'GET' || method === 'POST')) {
            const body = event.body ? JSON.parse(event.body) : {};
            const result = await categoryHandler(decoded.user_id, body, method, { pool, sandbox });
            return { statusCode: 200, body: result };

        } else if (path.endsWith('/category/reset') && method === 'POST') {
            const result = await resetHandler(decoded.user_id, { pool, sandbox });
            return { statusCode: 200, body: result };

        } else if (path.endsWith('/add-role') && method === 'POST') {
            return await addRoleHandler(event, { pool, sandbox });

        } else if (path.endsWith('/invite') && method === 'POST') {
            return await inviteHandler(event, { pool, sandbox });

        } else {
            logger.warn('UI route not found', { path, method });
            return {
                statusCode: 404,
                body: { message: 'UI route not found' }
            };
        }
    } catch (error) {
        logger.error('Error in UI router', { path, error: error.message });
        return {
            statusCode: 500,
            body: { message: error.message || 'Internal Server Error' }
        };
    }
    // Pool is intentionally NOT closed here
};