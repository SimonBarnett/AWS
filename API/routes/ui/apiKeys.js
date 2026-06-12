// ====================== routes/ui/apiKeys.js ======================
// Full original logic restored + adapted to pool + executeWithRetry pattern

const { logger, executeWithRetry, sql } = require('/opt/nodejs/helpers');

// Helper function to validate required fields
function validateSettings(settings, requiredFields) {
    return requiredFields.every(field => settings[field] && settings[field].trim() !== '');
}

module.exports = async (event, { pool, sandbox = false } = {}) => {
    try {
        const httpMethod = event.httpMethod;
        const path = event.path;
        const decoded = event.decoded;
        const userId = decoded.user_id;

        logger.debug('Received event', { path, httpMethod, userId });

        // ====================== GET /api-keys ======================
        if (httpMethod === 'GET' && path === '/api-keys') {
            const result = await executeWithRetry(() =>
                pool.request()
                    .input('user_id', sql.VarChar(8), userId)
                    .query(`
                        SELECT 
                            u.id,
                            u.api_key_type,
                            u.Description,
                            p.Icon,
                            u.LastStatus,
                            u.LastError
                        FROM dbo.UserApiKeys u
                        JOIN dbo.ApiProvider p ON u.api_key_type = p.Comment
                        WHERE u.user_id = @user_id
                        ORDER BY u.api_key_type, u.Description
                    `)
            );

            return { statusCode: 200, body: result.recordset };
        }

        // ====================== GET /api-keys/providers ======================
        if (httpMethod === 'GET' && path === '/api-keys/providers') {
            const providersResult = await executeWithRetry(() =>
                pool.request().query(`
                    SELECT Id, Comment, Description, Icon, SettingsJson
                    FROM dbo.ApiProvider
                `)
            );

            const providers = providersResult.recordset;

            for (let provider of providers) {
                const linksResult = await executeWithRetry(() =>
                    pool.request()
                        .input('ApiProviderId', sql.Int, provider.Id)
                        .query(`
                            SELECT Title, Link
                            FROM dbo.DocLinks
                            WHERE ApiProviderId = @ApiProviderId
                        `)
                );
                provider.docLinks = linksResult.recordset || [];
            }

            return { statusCode: 200, body: providers };
        }

        // ====================== POST /api-keys ======================
        if (httpMethod === 'POST' && path === '/api-keys') {
            const body = JSON.parse(event.body || '{}');
            const { api_key_type, Description, settings } = body;

            if (!api_key_type || !Description || !settings) {
                return { statusCode: 400, body: { error: 'Missing api_key_type, Description, or settings' } };
            }

            const providerResult = await executeWithRetry(() =>
                pool.request()
                    .input('api_key_type', sql.NVarChar, api_key_type)
                    .query(`
                        SELECT SettingsJson
                        FROM dbo.ApiProvider
                        WHERE Comment = @api_key_type
                    `)
            );

            if (!providerResult.recordset.length) {
                return { statusCode: 400, body: { error: 'Invalid api_key_type' } };
            }

            const settingsJson = JSON.parse(providerResult.recordset[0].SettingsJson);
            const requiredFields = Object.keys(settingsJson);

            if (!validateSettings(settings, requiredFields)) {
                return { statusCode: 400, body: { error: 'All settings fields are required' } };
            }

            const apiKeyData = JSON.stringify(settings);

            await executeWithRetry(() =>
                pool.request()
                    .input('user_id', sql.VarChar(8), userId)
                    .input('api_key_type', sql.NVarChar, api_key_type)
                    .input('api_key_data', sql.NVarChar, apiKeyData)
                    .input('Description', sql.NVarChar, Description)
                    .query(`
                        INSERT INTO dbo.UserApiKeys (user_id, api_key_type, api_key_data, Description, created_at, updated_at)
                        VALUES (@user_id, @api_key_type, @api_key_data, @Description, GETDATE(), GETDATE())
                    `)
            );

            if (sandbox) logger.debug('[SANDBOX] API key added', { userId, api_key_type });

            logger.info('API key added successfully', { userId, api_key_type, Description });
            return { statusCode: 201, body: { message: 'API key added successfully' } };
        }

        // ====================== DELETE /api-keys ======================
        if (httpMethod === 'DELETE' && path === '/api-keys') {
            const body = event.isBase64Encoded
                ? JSON.parse(Buffer.from(event.body, 'base64').toString())
                : new URLSearchParams(event.body || '');

            const api_key_type = body.get('api_key_type');
            const Description = body.get('Description');

            if (!api_key_type || !Description) {
                return { statusCode: 400, body: { error: 'Missing api_key_type or Description' } };
            }

            const result = await executeWithRetry(() =>
                pool.request()
                    .input('user_id', sql.VarChar(8), userId)
                    .input('api_key_type', sql.NVarChar, api_key_type)
                    .input('Description', sql.NVarChar, Description)
                    .query(`
                        DELETE FROM dbo.UserApiKeys
                        WHERE user_id = @user_id
                        AND api_key_type = @api_key_type
                        AND Description = @Description
                    `)
            );

            if (result.rowsAffected[0] === 0) {
                return { statusCode: 404, body: { error: 'API key not found' } };
            }

            if (sandbox) logger.debug('[SANDBOX] API key deleted', { userId, api_key_type });

            logger.info('API key deleted successfully', { userId, api_key_type, Description });
            return { statusCode: 200, body: { message: 'API key deleted successfully' } };
        }

        return { statusCode: 405, body: { error: 'Method not allowed or path not found' } };

    } catch (err) {
        logger.error('Error in apiKeys handler', { error: err.message });
        return {
            statusCode: err.message.includes('Unauthorized') ? 401 : 500,
            body: { error: err.message || 'Internal server error' }
        };
    }
};