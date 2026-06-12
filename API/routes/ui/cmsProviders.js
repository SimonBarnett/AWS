// ====================== routes/ui/cmsProviders.js ======================
const { logger, executeWithRetry, sql } = require('/opt/nodejs/helpers');

module.exports = async (event, { pool, sandbox = false } = {}) => {
    try {
        const httpMethod = event.httpMethod;
        const path = event.path;
        const pathParameters = event.pathParameters || {};
        const decoded = event.decoded;
        const userId = decoded?.user_id;

        if (httpMethod === 'GET' && path.match(/^\/cms-providers(\/[0-9]+)?$/)) {
            const providerId = pathParameters.id ? parseInt(pathParameters.id, 10) : null;

            let query = `
                SELECT p.id, p.Comment, p.Icon, p.Description
                FROM dbo.cmsProvider p
            `;
            const params = [];

            if (providerId) {
                query += ` WHERE p.id = @providerId`;
                params.push({ name: 'providerId', type: sql.Int, value: providerId });
            }
            query += ` ORDER BY p.Comment`;

            const providerRequest = pool.request();
            params.forEach(param => providerRequest.input(param.name, param.type, param.value));

            const providersResult = await executeWithRetry(() => providerRequest.query(query));
            const providers = providersResult.recordset;

            for (let provider of providers) {
                const linksResult = await executeWithRetry(() =>
                    pool.request()
                        .input('cmsProviderId', sql.Int, provider.id)
                        .query(`
                            SELECT Title, Link
                            FROM dbo.cmsDocLinks
                            WHERE cmsProviderId = @cmsProviderId
                            ORDER BY Title
                        `)
                );
                provider.docLinks = linksResult.recordset || [];
            }

            if (providerId && providers.length === 0) {
                return { statusCode: 404, body: { message: 'Provider not found' } };
            }

            if (sandbox) logger.debug('[SANDBOX] cmsProviders fetched', { providerId });

            return { statusCode: 200, body: providers };
        }

        return { statusCode: 405, body: { error: 'Method not allowed or path not found' } };

    } catch (err) {
        logger.error('Error in cmsProviders handler', { error: err.message });
        return { statusCode: 500, body: { error: err.message || 'Internal server error' } };
    }
};