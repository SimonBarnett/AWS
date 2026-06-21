// ====================== routes/winston/index.js ======================
// Simple Winston logging endpoint
// Last updated: 02 June 2026

const { logger } = require('/opt/nodejs/helpers');

module.exports = async (event) => {
    const method = event.httpMethod;

    try {
        if (method === 'POST') {
            const body = event.body ? JSON.parse(event.body) : {};

            logger.info('Winston endpoint received event', { body });

            return {
                statusCode: 200,
                body: { message: 'Event logged successfully' }
            };
        }

        if (method === 'OPTIONS') {
            return {
                statusCode: 200,
                body: {}
            };
        }

        return {
            statusCode: 405,
            body: { message: 'Method Not Allowed' }
        };

    } catch (error) {
        logger.error('Error in winston endpoint', { error: error.message });
        return {
            statusCode: 500,
            body: { message: 'Internal Server Error' }
        };
    }
};