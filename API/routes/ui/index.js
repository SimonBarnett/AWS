// ====================== routes/ui/index.js ======================
// UI Routes Sub-Router
// Creates one pool per request and passes { pool, sandbox } to all handlers

const { logger, getDbConnection } = require('/opt/nodejs/helpers');

const cmsProvidersHandler = require('./cmsProviders');
const apiKeysHandler = require('./apiKeys');
const metricsHandler = require('./metrics');
const chartDataHandler = require('./chartData');
const merchantPartsHandler = require('./merchantParts');
const categoryHandler = require('./category');
const resetHandler = require('./reset');
const deleteHandler = require('./delete');

module.exports = async (event) => {
    const path = event.path || '/';
    const method = event.httpMethod;
    const decoded = event.decoded;

    logger.debug('UI Router received request', { path, method });

    const pool = await getDbConnection();
    const sandbox = process.env.SANDBOX === 'true';

    try {
        if (path.startsWith('/cms-providers')) {
            return await cmsProvidersHandler(event, { pool, sandbox });

        } else if (path.startsWith('/api-keys')) {
            return await apiKeysHandler(event, { pool, sandbox });

        } else if (path === '/metrics' && method === 'GET') {
            return await metricsHandler(event, { pool, sandbox });

        } else if (path === '/chart-data' && method === 'GET') {
            return await chartDataHandler(event, { pool, sandbox });

        } else if (path === '/merchant-parts' && method === 'GET') {
            return await merchantPartsHandler(event, { pool, sandbox });

        } else if (path === '/category' && (method === 'GET' || method === 'POST')) {
            const body = event.body ? JSON.parse(event.body) : {};
            const result = await categoryHandler(decoded.user_id, body, method, { pool, sandbox });
            return { statusCode: 200, body: result };

        } else if (path === '/category/reset' && method === 'POST') {
            const result = await resetHandler(decoded.user_id, { pool, sandbox });
            return { statusCode: 200, body: result };

        } else if (path.startsWith('/delete')) {
            return await deleteHandler(event, { pool, sandbox });

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
    } finally {
        if (pool) await pool.close();
    }
};