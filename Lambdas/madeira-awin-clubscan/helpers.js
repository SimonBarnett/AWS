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

// ====================== Create Awin Merchant User ======================
async function createAwinMerchantUser(pool, { advertiserId, name, website }) {
    try {
        const userId = generateUserId();           // ← Now from auth layer
        const email = `${advertiserId}@awin.com`;
        const plainPassword = String(advertiserId);

        const hashedPassword = await hashPassword(plainPassword);

        logger.info('Creating Awin merchant user', { 
            advertiserId, 
            name, 
            userId, 
            email 
        });

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

        logger.info('✅ Awin merchant user created successfully', { userId, email, advertiserId });

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