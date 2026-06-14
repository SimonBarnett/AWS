// ====================== routes/rdsquery/index.js ======================
// RDS Query Handler (low-privilege account via ENV VARS ONLY)
// Uses same server/database as main app, only overrides user & password
// 
// IMPORTANT: The low-privilege password MUST ALWAYS come from the environment variable.
// NO fallbacks to SSM, defaults, or any other source are allowed.
// Last updated: 14 June 2026

const { logger, getDbConfig, sql } = require('/opt/nodejs/helpers');

// Low-privilege credentials — MUST come from ENV VARS. No fallbacks.
const LOW_PRIV_USER = process.env.DB_LOW_PRIV_USER;
const LOW_PRIV_PASSWORD = process.env.DB_LOW_PRIV_PASSWORD;

// Fail hard at module load if credentials are missing (no fallbacks allowed)
if (!LOW_PRIV_USER || !LOW_PRIV_PASSWORD) {
    throw new Error('FATAL: DB_LOW_PRIV_USER and DB_LOW_PRIV_PASSWORD environment variables are required. No fallbacks are permitted.');
}

module.exports = async (event) => {
    let pool = null;

    try {
        logger.debug('RDS Query request received');

        // Get base config from the core layer (server + database)
        const baseConfig = await getDbConfig();

        // Build low-privilege config (same server/database, different user/password)
        const lowPrivilegeConfig = {
            ...baseConfig,
            user: LOW_PRIV_USER,
            password: LOW_PRIV_PASSWORD,
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        };

        // Parse body
        let body = event.body || event;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                return {
                    statusCode: 400,
                    body: { error: 'Invalid JSON in request body' }
                };
            }
        }

        const { query } = body;

        if (!query) {
            return {
                statusCode: 400,
                body: { error: 'Query is required' }
            };
        }

        // Extract parameters from known query patterns (Menu / Part2)
        let userId = null;
        let category = null;
        let subCategory = null;

        const menuMatch = query.match(/(?:\[dbo\]\.\[Menu\]|dbo\.Menu)\s*\(\s*'([^']*)'(?:\s*,\s*('[^']*'|NULL|null))?\s*\)/i);
        const partMatch = query.match(/(?:\[dbo\]\.\[Part2\]|dbo\.Part2)\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(NULL|'[^']*'|null)\s*(?:,\s*[^)]*)?\)/i);

        if (menuMatch) {
            userId = menuMatch[1];
            category = menuMatch[2] && menuMatch[2].toUpperCase() !== 'NULL'
                ? menuMatch[2].replace(/'/g, '')
                : null;
        } else if (partMatch) {
            userId = partMatch[1];
            category = partMatch[2].replace(/'/g, '');
            subCategory = partMatch[3] && partMatch[3].toUpperCase() !== 'NULL'
                ? partMatch[3].replace(/'/g, '')
                : null;
        } else {
            return {
                statusCode: 400,
                body: { error: 'Unsupported query format' }
            };
        }

        // Get client IP
        const remoteIp =
            event.requestContext?.identity?.sourceIp ||
            event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
            'Unknown';

        // Connect using low-privilege credentials
        pool = await sql.connect(lowPrivilegeConfig);

        // Log the database call
        await pool.request()
            .input('RemoteIP', sql.NVarChar(45), remoteIp)
            .input('UserId', sql.NVarChar(50), userId)
            .input('Category', sql.NVarChar(255), category)
            .input('SubCategory', sql.NVarChar(255), subCategory)
            .query(`
                INSERT INTO [dbo].[DatabaseCallLog] (RemoteIP, UserId, Category, SubCategory)
                VALUES (@RemoteIP, @UserId, @Category, @SubCategory)
            `);

        // Execute the query with low privileges
        const result = await pool.request().query(query);

        return {
            statusCode: 200,
            body: result.recordset
        };

    } catch (error) {
        logger.error('RDS Query error', { error: error.message });
        return {
            statusCode: 500,
            body: { error: error.message }
        };
    } finally {
        if (pool) await pool.close();
    }
};