// ====================== index.js ======================
// Simple API Gateway Orchestrator
// madeira-api-gateway
// Last updated: 16 June 2026

const { logger } = require('/opt/nodejs/helpers');
const { verifyJWT } = require('/opt/nodejs/jwt');

// Sub-routers
const uiRoutes        = require('./routes/ui');
const tokenRoutes     = require('./routes/token');
const amazoncardRoutes = require('./routes/amazoncard');
const rdsqueryRoutes  = require('./routes/rdsquery');
const winstonRoutes   = require('./routes/winston');

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
};

module.exports.handler = async (event) => {
    let path = event.path || '/';
    const method = event.httpMethod;

    console.log('REQUEST RECEIVED', { path, method });

    if (method === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        // Normalise stage
        let sandbox = false;
        if (path.startsWith('/prod/')) {
            path = path.replace(/^\/prod/, '');
        } else if (path.startsWith('/sandbox/')) {
            path = path.replace(/^\/sandbox/, '');
            sandbox = true;
        }
        if (!path.startsWith('/')) path = '/' + path;

        // /ui/ routes
        if (path.includes('/ui/')) {
            let token = event.headers?.authorization || event.headers?.Authorization || '';
            if (token.startsWith('Bearer ')) token = token.substring(7).trim();

            if (!token) {
                return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ status: 'error', error_message: 'No token provided' }) };
            }

            try {
                event.decoded = await verifyJWT(token);
            } catch (e) {
                return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ status: 'error', error_message: 'Unauthorized' }) };
            }

            const response = await uiRoutes(event, { sandbox });
            const body = typeof response.body === 'string' 
                ? response.body 
                : JSON.stringify(response.body || {});

            return {
                statusCode: response.statusCode || 200,
                headers: { ...corsHeaders, ...(response.headers || {}) },
                body
            };
        }

        // amazoncard
        if (path.includes('/amazoncard')) {
            const response = await amazoncardRoutes(event, { sandbox });
            const body = typeof response.body === 'string' 
                ? response.body 
                : JSON.stringify(response.body || {});
            return {
                statusCode: response.statusCode || 200,
                headers: { ...corsHeaders, ...(response.headers || {}) },
                body
            };
        }

        // rdsquery / query
        if (path.includes('/rdsquery') || path.includes('/query')) {
            const response = await rdsqueryRoutes(event, { sandbox });
            const body = typeof response.body === 'string' 
                ? response.body 
                : JSON.stringify(response.body || {});
            return {
                statusCode: response.statusCode || 200,
                headers: { ...corsHeaders, ...(response.headers || {}) },
                body
            };
        }

        // winston
        if (path.includes('/winston')) {
            const response = await winstonRoutes(event, { sandbox });
            const body = typeof response.body === 'string' 
                ? response.body 
                : JSON.stringify(response.body || {});
            return {
                statusCode: response.statusCode || 200,
                headers: { ...corsHeaders, ...(response.headers || {}) },
                body
            };
        }

        // DEFAULT → tokenRoutes (supports 302)
        const response = await tokenRoutes(event, { sandbox });

        if (response.headers && Object.keys(response.headers).length > 0) {
            return {
                statusCode: response.statusCode || 200,
                headers: { ...corsHeaders, ...response.headers },
                body: response.body || ''
            };
        }

        const body = typeof response.body === 'string' 
            ? response.body 
            : JSON.stringify(response.body || {});

        return {
            statusCode: response.statusCode || 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body
        };

    } catch (error) {
        logger.error('Orchestrator error', { error: error.message, stack: error.stack });
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: error.message || 'Internal Server Error' })
        };
    }
};