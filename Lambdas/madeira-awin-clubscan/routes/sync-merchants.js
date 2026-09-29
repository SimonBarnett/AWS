// routes/sync-merchants.js
const { logger, sql } = require('/opt/nodejs/helpers');
const { getAwinConfig } = require('/opt/nodejs/conf/awin-config');

async function run(pool) {
    logger.info('🔄 Starting FULL ENRICHMENT SYNC of AwinHighApprovalMerchants');

    try {
        // Pull credentials from the central config (same source as onboarding.js)
        const awin = await getAwinConfig();
        const PUBLISHER_ID = awin.AWIN_PUBLISHER_ID;
        const ACCESS_TOKEN = awin.AWIN_ACCESS_TOKEN;

        if (!ACCESS_TOKEN) {
            throw new Error('AWIN_ACCESS_TOKEN is missing from config');
        }

        // ====================== 1. FETCH JOINED MERCHANTS ======================
        const url = `https://api.awin.com/publishers/${PUBLISHER_ID}/programmes?relationship=joined&limit=500`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            logger.error('Awin merchant sync fetch failed', {
                status: response.status,
                url,
                body: errorBody
            });
            throw new Error(`AWIN joined fetch failed: ${response.status}`);
        }

        const programmes = await response.json();
        logger.info(`Received ${programmes.length} joined merchants from AWIN`);

        // Reset Joined flag
        await pool.request().query(`
            UPDATE dbo.AwinHighApprovalMerchants
            SET Joined = 0, LastSynced = GETDATE()
        `);

        // ====================== 2. MERGE JOINED MERCHANTS ======================
        if (programmes.length > 0) {
            const values = programmes.map(m => {
                const safeName = m.name ? `'${m.name.replace(/'/g, "''")}'` : 'NULL';
                const safePrimarySector = m.primarySector ? `'${m.primarySector.replace(/'/g, "''")}'` : 'NULL';
                const safeDescription = m.description ? `'${m.description.replace(/'/g, "''")}'` : 'NULL';
                const safeCurrency = m.currencyCode ? `'${m.currencyCode}'` : 'NULL';
                const safeLogo = m.logoUrl ? `'${m.logoUrl.replace(/'/g, "''")}'` : 'NULL';
                const safePaymentStatus = m.paymentStatus ? `'${m.paymentStatus.replace(/'/g, "''")}'` : "'Exposure Level 1'";

                return `(${m.id}, ${safeName}, ${safePrimarySector}, ${safeDescription}, ${safeCurrency}, ${safeLogo}, ${safePaymentStatus}, 1)`;
            }).join(',');

            await pool.request().query(`
                MERGE dbo.AwinHighApprovalMerchants AS target
                USING (VALUES ${values}) AS source (
                    MerchantId, Name, primarySector, description, 
                    currencyCode, logoUrl, PaymentStatus, Joined
                )
                ON target.MerchantId = source.MerchantId
                WHEN MATCHED THEN
                    UPDATE SET 
                        Joined        = 1,
                        LastSynced    = GETDATE(),
                        Name          = COALESCE(source.Name,          target.Name),
                        primarySector = COALESCE(source.primarySector, target.primarySector),
                        description   = COALESCE(source.description,   target.description),
                        currencyCode  = COALESCE(source.currencyCode,  target.currencyCode),
                        logoUrl       = COALESCE(source.logoUrl,       target.logoUrl),
                        PaymentStatus = COALESCE(source.PaymentStatus, target.PaymentStatus)
                WHEN NOT MATCHED THEN
                    INSERT (MerchantId, Name, primarySector, description, currencyCode, logoUrl, PaymentStatus, Joined, LastSynced)
                    VALUES (source.MerchantId, source.Name, source.primarySector, source.description, source.currencyCode, source.logoUrl, source.PaymentStatus, 1, GETDATE());
            `);

            logger.info(`✅ MERGE completed for joined merchants`);
        }

    } catch (err) {
        logger.error('💥 Merchant sync failed', { error: err.message });
        throw err;
    }
}

module.exports = { run };