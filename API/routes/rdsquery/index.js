// ====================== routes/rdsquery/index.js ======================
// RDS Query Handler — FULL UNABRIDGED
// Fixed: Part2 pagination now passes row number (not product ID).
// Catalogue lookup for Part2 calls now uses category only (ignores the pagination cursor).

const { logger, getDbConfig, sql } = require('/opt/nodejs/helpers');
const crypto = require('crypto');

const LOW_PRIV_USER = process.env.DB_LOW_PRIV_USER;
const LOW_PRIV_PASSWORD = process.env.DB_LOW_PRIV_PASSWORD;

module.exports = async (event) => {
    let pool = null;

    const mergeFingerprint = async (fingerprintHash, userId, email = null) => {
        logger.info('MERGE UserFingerprints', { fingerprintHash: fingerprintHash.substring(0,8)+'...', userId });
        await pool.request()
            .input('fingerprint_hash', sql.VarChar(64), fingerprintHash)
            .input('user_id', sql.VarChar(8), userId)
            .input('email', sql.NVarChar(255), email)
            .query(`
                MERGE [dbo].[UserFingerprints] AS t
                USING (SELECT @fingerprint_hash AS h, @user_id AS u, @email AS e) AS s
                ON t.fingerprint_hash = s.h
                WHEN MATCHED THEN UPDATE SET email = COALESCE(s.e, t.email), updated_at = GETDATE(), Clicks = ISNULL(t.Clicks, 0) + 1
                WHEN NOT MATCHED THEN INSERT (fingerprint_hash, user_id, email, Clicks) VALUES (s.h, s.u, s.e, 1);
            `);

        const idResult = await pool.request()
            .input('fingerprint_hash', sql.VarChar(64), fingerprintHash)
            .query(`SELECT id AS fingerprint_id FROM [dbo].[UserFingerprints] WHERE fingerprint_hash = @fingerprint_hash`);
        const fid = idResult.recordset[0]?.fingerprint_id || 0;
        logger.info('Fingerprint ID resolved', { fingerprintId: fid });
        return fid;
    };

    const getCategoryId = async (partid = null, category = null, subcategory = null, userId = 'SYSTEM') => {
        logger.debug('getCategoryId invoked', { partid, category, subcategory });

        let catalogId;

        if (partid) {
            const catalogResult = await pool.request()
                .input('productId', sql.Int, partid)
                .input('userId', sql.NVarChar(50), userId)
                .query(`SELECT dbo.Catalog.ID AS catalog_id FROM dbo.Products INNER JOIN dbo.Catalog ON dbo.Products.Category = dbo.Catalog.MainCategory AND dbo.Products.Subcategory = dbo.Catalog.SubCategory WHERE dbo.Products.ID = @productId AND dbo.Products.UserId = @userId`);
            catalogId = catalogResult.recordset[0]?.catalog_id;
        
        } else if (category && subcategory) {
            const catalogResult = await pool.request()
                .input('category', sql.NVarChar(255), category)
                .input('subcategory', sql.NVarChar(255), subcategory)
                .input('userId', sql.NVarChar(50), userId)
                .query(`SELECT TOP 1 ID FROM [dbo].[Catalog] WHERE UserId = @userId AND MainCategory = @category AND SubCategory = @subcategory`);
            catalogId = catalogResult.recordset[0]?.ID;
        
        } else if (category) {
            const catalogResult = await pool.request()
                .input('category', sql.NVarChar(255), category)
                .input('userId', sql.NVarChar(50), userId)
                .query(`SELECT TOP 1 ID FROM [dbo].[Catalog] WHERE UserId = @userId AND MainCategory = @category ORDER BY MainCategoryOrder`);
            catalogId = catalogResult.recordset[0]?.ID;
        
        } else {
            const catalogResult = await pool.request()
                .input('userId', sql.NVarChar(50), userId)
                .query(`SELECT TOP 1 ID FROM [dbo].[Catalog] WHERE UserId = @userId ORDER BY MainCategoryOrder`);
            catalogId = catalogResult.recordset[0]?.ID;
        }

        if (!catalogId) {
            logger.error('No valid catalog_id resolved — check Catalog table for user', { userId });
            throw new Error(`No catalog_id found for user ${userId} with provided params — check Catalog table for this user`);
        }

        logger.debug('getCategoryId returned', { catalogId });
        return catalogId;
    };

    try {
        logger.debug('RDS Query request received');

        if (!LOW_PRIV_USER || !LOW_PRIV_PASSWORD) {
            logger.error('DB_LOW_PRIV_USER or DB_LOW_PRIV_PASSWORD environment variables are not set');
            return { statusCode: 500, body: { error: 'Low-privilege database credentials not configured' } };
        }

        const baseConfig = await getDbConfig();
        const lowPrivilegeConfig = {
            ...baseConfig,
            user: LOW_PRIV_USER,
            password: LOW_PRIV_PASSWORD,
            options: { encrypt: true, trustServerCertificate: true }
        };

        let body = event.body || event;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {
                return { statusCode: 400, body: { error: 'Invalid JSON in request body' } };
            }
        }

        const { query, fingerprint, productId, email } = body;
        const incomingUserId = body.userId || 'SYSTEM';

        logger.info('Request body parsed', { 
            hasQuery: !!query, 
            hasProductId: !!productId, 
            incomingUserId 
        });

        let fingerprintHash = fingerprint || event.headers?.['x-fingerprint'];
        if (!fingerprintHash) {
            const ip = event.requestContext?.identity?.sourceIp || 
                       event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() || 'unknown';
            const ua = event.headers?.['user-agent'] || 'unknown';
            fingerprintHash = crypto.createHash('sha256').update(ip + ua).digest('hex');
        }

        pool = await sql.connect(lowPrivilegeConfig);

        if (productId) {
            logger.info('PRODUCT ID BRANCH', { productId, userId: incomingUserId });
            const fingerprintId = await mergeFingerprint(fingerprintHash, incomingUserId, email);

            const catalogId = await getCategoryId(productId, null, null, incomingUserId);

            await pool.request()
                .input('fingerprint_id', sql.Int, fingerprintId)
                .input('catalog_id', sql.Int, catalogId)
                .input('product_id', sql.Int, productId)
                .input('ts', sql.DateTime, new Date())
                .query(`
                    INSERT INTO [dbo].[FingerprintCatalogAccess] (fingerprint_id, catalog_id, ProductID, timestamp)
                    VALUES (@fingerprint_id, @catalog_id, @product_id, @ts)
                `);

            return { statusCode: 200, body: { status: 'ok', fingerprint_id: fingerprintId, catalogId } };
        }

        if (query) {
            let userId = null;
            let category = null;
            let subCategory = null;
            let lastID = null;

            const menuMatch = query.match(/(?:\[dbo\]\.\[Menu\]|dbo\.Menu)\s*\(\s*'([^']*)'(?:\s*,\s*('[^']*'|NULL|null))?\s*\)/i);
            const partMatch = query.match(/Part2\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(?:NULL|'[^']*'|null)\s*,\s*(?:NULL|'[^']*'|null)\s*,\s*(?:NULL|'[^']*'|null)\s*,\s*(\d+|NULL|null)\s*,\s*\d+\s*,\s*'([^']*)'/i);

            if (menuMatch) {
                userId = menuMatch[1];
                category = menuMatch[2] && menuMatch[2].toUpperCase() !== 'NULL' ? menuMatch[2].replace(/'/g, '') : null;
                const fingerprintId = await mergeFingerprint(fingerprintHash, userId, email);

                const catalogId = await getCategoryId(null, category, null, userId);

                await pool.request()
                    .input('fingerprint_id', sql.Int, fingerprintId)
                    .input('catalog_id', sql.Int, catalogId)
                    .input('ts', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO [dbo].[FingerprintCatalogAccess] (fingerprint_id, catalog_id, timestamp) 
                        VALUES (@fingerprint_id, @catalog_id, @ts)
                    `);

            } else if (partMatch) {
                userId = partMatch[1];
                category = partMatch[2].replace(/'/g, '');
                lastID = partMatch[3].toUpperCase() === 'NULL' ? null : parseInt(partMatch[3]);

                const fingerprintId = await mergeFingerprint(fingerprintHash, userId, email);

                // IMPORTANT FIX:
                // lastID is now the row number from ROW_NUMBER() for pagination.
                // We must NOT pass it to getCategoryId, otherwise it tries to find a product with ID = 50, 100, etc.
                // Always use category-based lookup for Part2 calls.
                const catalogId = await getCategoryId(null, category, subCategory, userId);

                await pool.request()
                    .input('fingerprint_id', sql.Int, fingerprintId)
                    .input('catalog_id', sql.Int, catalogId)
                    .input('ts', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO [dbo].[FingerprintCatalogAccess] (fingerprint_id, catalog_id, timestamp) 
                        VALUES (@fingerprint_id, @catalog_id, @ts)
                    `);
            } else {
                logger.error('Unsupported query format');
                return { statusCode: 400, body: { error: 'Unsupported query format' } };
            }

            const result = await pool.request().query(query);
            logger.info('Query executed successfully', { rowCount: result.recordset.length });
            return { statusCode: 200, body: result.recordset };
        }

        return { statusCode: 400, body: { error: 'Invalid request' } };

    } catch (error) {
        logger.error('RDS Query error', { error: error.message });
        return { statusCode: 500, body: { error: error.message } };
    } finally {
        if (pool) await pool.close().catch(() => {});
    }
};