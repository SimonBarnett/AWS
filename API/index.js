// ====================== index.js ======================
// Single /{proxy+} API Gateway Orchestrator
// madeira-api-gateway
// Last updated: 13 June 2026

const { logger } = require('/opt/nodejs/helpers');
const { verifyJWT } = require('/opt/nodejs/jwt');

// Sub-routers
const uiRoutes        = require('./routes/ui');
const tokenRoutes     = require('./routes/token');
const amazoncardRoutes = require('./routes/amazoncard');
const rdsqueryRoutes  = require('./routes/rdsquery');
const winstonRoutes   = require('./routes/winston');

// ====================== CORS HEADERS ======================
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
};

// Routes that do NOT require JWT authentication
const PUBLIC_ROUTES = [
    '/token',
    '/login',
    '/onboarding',
    '/complete-signup',
    '/amazoncard',      // Claim only (Topup moved to separate Lambda)
    '/winston',
    '/query',
    '/rds'
];

module.exports.handler = async (event) => {
    const path = event.path || '/';
    const method = event.httpMethod;

    logger.debug('Incoming request', { path, method });

    if (method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    try {
        // /login/delegate requires authentication (the logged-in user is delegating)
        // /login/acceptdelegation remains public (new user accepting delegation)
        const isPublicRoute =
            PUBLIC_ROUTES.some(route => path.startsWith(route)) &&
            !path.startsWith('/login/delegate');

        if (!isPublicRoute) {
            // Extract Bearer token from Authorization header
            const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
            const token = authHeader.startsWith('Bearer ')
                ? authHeader.substring(7).trim()
                : authHeader.trim();

            if (!token) {
                throw new Error('Unauthorized - No token provided');
            }

            const decoded = await verifyJWT(token);
            event.decoded = decoded;

            logger.info('Routing protected request', { path, method, userId: decoded.user_id });
        } else {
            logger.info('Routing public request', { path, method });
        }

        let response;

        if (path.startsWith('/ui')) {
            response = await uiRoutes(event);

        } else if (
            path.startsWith('/token') ||
            path.startsWith('/login') ||
            path.startsWith('/onboarding') ||
            path.startsWith('/complete-signup')
        ) {
            response = await tokenRoutes(event);

        } else if (path.startsWith('/amazoncard')) {
            response = await amazoncardRoutes(event);

        } else if (path.startsWith('/query') || path.startsWith('/rds')) {
            response = await rdsqueryRoutes(event);

        } else if (path.startsWith('/winston')) {
            response = await winstonRoutes(event);

        } else {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Route not found', path })
            };
        }

        return {
            statusCode: response.statusCode || 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            body: typeof response.body === 'string'
                ? response.body
                : JSON.stringify(response.body)
        };

    } catch (error) {
        logger.error('Orchestrator error', { error: error.message, stack: error.stack });

        const statusCode =
            error.message.includes('Unauthorized') || error.message.includes('JWT')
                ? 401
            : 500;

        return {
            statusCode,
            headers: corsHeaders,
            body: JSON.stringify({ message: error.message || 'Internal Server Error' })
        };
    }
};