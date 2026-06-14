// routes/sync-merchants.js
const { logger } = require('/opt/nodejs/helpers');

async function run(pool) {
    logger.info('🔄 Starting CLEAN SYNC of AwinHighApprovalMerchants');

    try {
        const url = `https://api.awin.com/publishers/${process.env.AWIN_PUBLISHER_ID}/programmes?relationship=joined&limit=500`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${process.env.AWIN_ACCESS_TOKEN}` }
        });

        if (!response.ok) throw new Error(`AWIN joined fetch failed: ${response.status}`);

        const programmes = await response.json();
        logger.info(`Received ${programmes.length} joined merchants from AWIN`);

        // Reset everything
        await pool.request().query(`
            UPDATE dbo.AwinHighApprovalMerchants
            SET Joined = 0, LastSynced = GETDATE()
        `);

        if (programmes.length > 0) {
            const values = programmes.map(m => {
                const safeName          = m.name         ? `'${m.name.replace(/'/g, "''")}'`          : 'NULL';
                const safePrimarySector = m.primarySector ? `'${m.primarySector.replace(/'/g, "''")}'` : 'NULL';
                const safeDescription   = m.description  ? `'${m.description.replace(/'/g, "''")}'`   : 'NULL';
                const safeCurrency      = m.currencyCode  ? `'${m.currencyCode}'`                     : 'NULL';
                const safeLogo          = m.logoUrl       ? `'${m.logoUrl.replace(/'/g, "''")}'`       : 'NULL';
                const safePaymentStatus = m.paymentStatus ? `'${m.paymentStatus.replace(/'/g, "''")}'` : "'Exposure Level 1'";

                return `(${m.id}, ${safeName}, ${safePrimarySector}, ${safeDescription}, ${safeCurrency}, ${safeLogo}, ${safePaymentStatus}, 1)`;
            }).join(',');

            const mergeResult = await pool.request().query(`
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
                        Name          = COALESCE(target.Name,          source.Name),
                        primarySector = COALESCE(target.primarySector, source.primarySector),
                        description   = COALESCE(target.description,   source.description),
                        currencyCode  = COALESCE(target.currencyCode,  source.currencyCode),
                        logoUrl       = COALESCE(target.logoUrl,       source.logoUrl),
                        PaymentStatus = COALESCE(target.PaymentStatus, source.PaymentStatus)
                WHEN NOT MATCHED THEN
                    INSERT (MerchantId, Name, primarySector, description, currencyCode, logoUrl, PaymentStatus, Joined, LastSynced)
                    VALUES (source.MerchantId, source.Name, source.primarySector, source.description, source.currencyCode, source.logoUrl, source.PaymentStatus, 1, GETDATE());
            `);

            logger.info(`✅ MERGE completed – ${mergeResult.rowsAffected[0] || 0} merchants updated/inserted`);
        }

        logger.info('🔄 Full clean AwinHighApprovalMerchants sync completed');
    } catch (err) {
        logger.error('💥 Merchant sync failed', { error: err.message });
        throw err;
    }
}

module.exports = { run };