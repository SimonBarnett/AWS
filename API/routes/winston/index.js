// ====================== routes/winston/index.js ======================
// Public logging endpoint for external JavaScript widgets and scripts
// Allows client-side code to send structured logs directly to CloudWatch via the API
// 
// IMPORTANT: This route ALWAYS logs at DEBUG level in the API context,
// regardless of the global LOG_LEVEL environment variable.
// Last updated: 14 June 2026

const { logger } = require('/opt/nodejs/helpers');

module.exports = async (event) => {
    const method = (event.httpMethod || '').toUpperCase();

    // Always allow CORS preflight
    if (method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (method !== 'POST') {
        return {
            statusCode: 405,
            body: { error: 'Method Not Allowed. Use POST to log events.' }
        };
    }

    try {
        const body = event.body ? JSON.parse(event.body) : {};

        // Extract common fields from external log payload
        const {
            level = 'info',
            message,
            context = {},
            source = 'external-js',
            url,
            userAgent
        } = body;

        if (!message) {
            return {
                statusCode: 400,
                body: { error: 'message is required in log payload' }
            };
        }

        // Build enriched log object
        const logPayload = {
            source,
            url: url || event.headers?.referer || 'unknown',
            userAgent: userAgent || event.headers?.['User-Agent'] || 'unknown',
            ...context
        };

        // ALWAYS use debug level for external logs in this route
        // This ensures client-side issues are captured even if LOG_LEVEL is set to 'info' or higher
        logger.debug(`[EXTERNAL LOG] ${message}`, logPayload);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: { status: 'success', message: 'Log received' }
        };

    } catch (error) {
        logger.error('Error processing external log', { error: error.message });
        return {
            statusCode: 500,
            body: { error: 'Failed to process log entry' }
        };
    }
};