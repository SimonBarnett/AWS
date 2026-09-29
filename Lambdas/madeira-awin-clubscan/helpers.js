// helpers.js - madeira-awin-clubscan
// Only Awin-specific logic. Generic functions come from layers.

const { logger, hashPassword, sql } = require('/opt/nodejs/helpers');
const { generateUserId } = require('/opt/nodejs/auth-utils');

// ====================== Awin-specific helpers ======================

async function getAlreadyRecommendedMerchants(pool) {
    try {
        const result = await pool.request().query(`
            SELECT MerchantId 
            FROM AwinRecommendedMerchants 
            WHERE Mode = 'global' 
            AND SentAt >= DATEADD(DAY, -90, GETDATE())
        `);
        return new Set(result.recordset.map(r => r.MerchantId));
    } catch (error) {
        logger.error('Failed to get already recommended merchants', { error: error.message });
        return new Set();
    }
}

async function recordRecommendedMerchants(pool, merchantIds) {
    if (!merchantIds || merchantIds.length === 0) return;

    try {
        const values = merchantIds.map(id => `(${id}, 'global')`).join(',');
        await pool.request().query(`
            INSERT INTO AwinRecommendedMerchants (MerchantId, Mode)
            VALUES ${values}
        `);
        logger.info('Recorded recommended merchants for global mode', { count: merchantIds.length });
    } catch (error) {
        logger.error('Failed to record recommended merchants', { error: error.message });
    }
}

async function createAwinMerchantUser(pool, { advertiserId, name, website, accessToken, publisherId }) {
    try {
        const userId = generateUserId();
        const email = `${advertiserId}@awin.com`;
        const plainPassword = String(advertiserId);
        const hashedPassword = await hashPassword(plainPassword);

        logger.info('Creating Awin merchant user', { 
            advertiserId, 
            name, 
            userId, 
            email 
        });

        // ====================== 1. CREATE USER ======================
        await pool.request()
            .input('userId', sql.VarChar(20), userId)
            .input('email', sql.VarChar(255), email)
            .input('name', sql.VarChar(255), name || 'Awin Merchant')
            .input('website', sql.VarChar(500), website || null)
            .input('hashedPassword', sql.VarChar(255), hashedPassword)
            .input('phoneNumber', sql.VarChar(20), '+447989389179')
            .query(`
                MERGE INTO Users AS target
                USING (SELECT @userId AS user_id, @email AS email_address) AS source
                ON target.user_id = source.user_id
                WHEN MATCHED THEN
                    UPDATE SET 
                        email_address = source.email_address,
                        first_name    = COALESCE(target.first_name, @name),
                        last_name     = 'Merchant',
                        company_name  = @name,
                        website_url   = @website,
                        password      = @hashedPassword,
                        permissions   = '["merchant"]',
                        role          = 'merchant',
                        phone_number  = @phoneNumber,
                        signupurl     = 'https://awin.com/',
                        updated_at    = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (
                        user_id, email_address, first_name, last_name, 
                        company_name, website_url, password, 
                        permissions, role, phone_number, signupurl, 
                        created_at, updated_at
                    )
                    VALUES (
                        @userId, @email, @name, 'Merchant', 
                        @name, @website, @hashedPassword, 
                        '["merchant"]', 'merchant', @phoneNumber, 'https://awin.com/', 
                        GETDATE(), GETDATE()
                    );
            `);

        // ====================== 2. GET ALL FEEDS FROM MODERN API ======================
        let feedsWithDownloadUrl = [];

        try {
            // Use the credentials that were passed in from onboarding.js
            // (never call getAwinCredentials here – it is not in scope)
            const response = await fetch(
                `https://api.awin.com/publishers/${publisherId}/product-feeds?advertiserId=${advertiserId}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                const feeds = data.feeds || data.data || [];
                feedsWithDownloadUrl = feeds.filter(feed => feed.downloadUrl);
            } else {
                const errorBody = await response.text();
                logger.warn('Modern API call failed when fetching feeds', { 
                    advertiserId, 
                    status: response.status,
                    body: errorBody.substring(0, 300)
                });
            }
        } catch (apiErr) {
            logger.warn('Modern API call failed when fetching feeds', { 
                advertiserId, 
                error: apiErr.message 
            });
        }

        // ====================== 3. CREATE ONE UserApiKeys ROW PER FEED ======================
        const merchantName = name || `Advertiser ${advertiserId}`;

        for (let index = 0; index < feedsWithDownloadUrl.length; index++) {
            const feed = feedsWithDownloadUrl[index];
            const feedId = feed.feedId || feed.id;
            const feedNumber = index + 1;
            const description = `Awin Product Feed - ${merchantName} #${feedNumber}`;

            // Only feedUrl in the JSON
            const apiKeyData = JSON.stringify({
                feedUrl: feed.downloadUrl
            });

            try {
                await pool.request()
                    .input('userId', sql.VarChar(8), userId)
                    .input('apiKeyType', sql.VarChar(50), 'awin')
                    .input('apiKeyData', sql.NVarChar(sql.MAX), apiKeyData)
                    .input('description', sql.NVarChar(255), description)
                    .query(`
                        MERGE INTO UserApiKeys AS target
                        USING (SELECT @userId AS user_id, @apiKeyType AS api_key_type, @description AS Description) AS source
                        ON target.user_id = source.user_id 
                           AND target.api_key_type = source.api_key_type 
                           AND target.Description = source.Description
                        WHEN NOT MATCHED THEN
                            INSERT (
                                user_id, 
                                api_key_type, 
                                api_key_data, 
                                Description, 
                                created_at, 
                                updated_at, 
                                LastStatus
                            )
                            VALUES (
                                @userId, 
                                @apiKeyType, 
                                @apiKeyData, 
                                @description, 
                                GETDATE(), 
                                GETDATE(), 
                                0
                            );
                    `);

                logger.info('✅ Created UserApiKeys record', { 
                    userId, 
                    advertiserId, 
                    merchantName,
                    feedNumber,
                    feedId 
                });
            } catch (err) {
                logger.error('Failed to create UserApiKeys record', { 
                    advertiserId, 
                    feedId, 
                    error: err.message 
                });
            }
        }

        if (feedsWithDownloadUrl.length === 0) {
            logger.info('No feeds with downloadUrl found - skipping UserApiKeys creation', { 
                advertiserId,
                merchantName 
            });
        }

        return { userId, email };

    } catch (error) {
        logger.error('Failed to create Awin merchant user', { 
            advertiserId, 
            name, 
            error: error.message 
        });
        throw error;
    }
}
module.exports = {
    getAlreadyRecommendedMerchants,
    recordRecommendedMerchants,
    createAwinMerchantUser
};