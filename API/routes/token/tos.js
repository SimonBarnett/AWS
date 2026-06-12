// ====================== routes/token/tos.js ======================
const { logger } = require('/opt/nodejs/helpers');

module.exports = async (event, { pool, sandbox = false } = {}) => {
    const service = event.queryStringParameters?.service || 'default';

    // In a real implementation, fetch ToS from DB or config using pool
    const tosContent = `Terms of Service for ${service}...\n\n[Full legal text here]`;

    if (sandbox) logger.debug('[SANDBOX] ToS requested', { service });

    return {
        statusCode: 200,
        body: tosContent
    };
};