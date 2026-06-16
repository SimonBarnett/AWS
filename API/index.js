// ====================== index.js ======================
// Single /{proxy+} API Gateway Orchestrator
// madeira-api-gateway
// Last updated: 15 June 2026

const { logger } = require('/opt/nodejs/helpers');
const { verifyJWT } = require('/opt/nodejs/jwt');

// Sub-routers
const uiRoutes        = require('./routes/ui');
const tokenRoutes     = require('./routes/token');
const amazoncardRoutes = require('./routes/amazoncard');
const rdsqueryRoutes  = require('./routes/rdsquery');
const winstonRoutes   = require('./routes/winston');

// Specific route handler
const onboardingRoute = require('./routes/token/onboarding');

// ====================== CORS HEADERS ======================
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
};

module.exports.handler = async (event) => {
    const path = event.path || '/';
    const method = event.httpMethod;

    // === SUPER EARLY LOG ===
    console.log('REQUEST RECEIVED', { path, method, fullPath: event.path, query: event.queryStringParameters });

    if (method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    try {
        let response;

        // =====================================================
        // SPECIFIC ROUTES (checked FIRST) — ultra tolerant
        // =====================================================

        if (method === 'GET' && 
            path.toLowerCase().includes('onboarding') && 
            !path.includes('validate-onboarding-token')) {
            
            console.log('>>> ONBOARDING COMPLETE ROUTE HIT SUCCESSFULLY', { path, method });
            return await onboardingRoute(event, { action: 'complete', pool: null, sandbox: null });
        }

        else if (method === 'PUT' && path.includes('validate-onboarding-token')) {
            return await tokenRoutes(event);
        }

        else if (method === 'POST' && path.includes('complete-signup')) {
            return await tokenRoutes(event);
        }

        // =====================================================
        // BROAD CATCH-ALL ROUTES
        // =====================================================

        else if (
            path.startsWith('/token') ||
            path.startsWith('/login') ||
            path.startsWith('/onboarding') ||
            path.startsWith('/complete-signup')
        ) {
            response = await tokenRoutes(event);
        }

        else if (path.startsWith('/ui')) {
            response = await uiRoutes(event);
        }

        else if (path.startsWith('/amazoncard')) {
            response = await amazoncardRoutes(event);
        }

        else if (path.startsWith('/query') || path.startsWith('/rds')) {
            response = await rdsqueryRoutes(event);
        }

        else if (path.startsWith('/winston')) {
            response = await winstonRoutes(event);
        }

        else {
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