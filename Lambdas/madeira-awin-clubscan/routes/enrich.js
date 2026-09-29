// routes/enrich.js
const { logger, sql } = require('/opt/nodejs/helpers');
const { getAwinConfig } = require('/opt/nodejs/conf/awin-config');

async function run(pool) {
    logger.info('🔄 Starting ENRICH ONLY for AwinHighApprovalMerchants');

    try {
        const awin = await getAwinConfig();
        const PUBLISHER_ID = awin.AWIN_PUBLISHER_ID;
        const ACCESS_TOKEN = awin.AWIN_ACCESS_TOKEN;

        if (!ACCESS_TOKEN) {
            throw new Error('AWIN_ACCESS_TOKEN is missing from config');
        }

        // Only enrich merchants that are still joined and missing logo
        const missingResult = await pool.request().query(`
            SELECT MerchantId 
            FROM dbo.AwinHighApprovalMerchants 
            WHERE (logoUrl IS NULL OR logoUrl = '')              
        `);

        const missingIds = missingResult.recordset.map(r => r.MerchantId);
        logger.info(`Found ${missingIds.length} merchants needing enrichment`);

        let enrichedCount = 0;
        let deletedCount = 0;
        let blockedCount = 0;
        let stoppedEarly = false;

        const ENRICHMENT_DELAY_MS = 2000;

        for (const merchantId of missingIds) {
            if (stoppedEarly) break;

            try {
                const detailUrl = `https://api.awin.com/publishers/${PUBLISHER_ID}/programmes/${merchantId}`;

                const detailResponse = await fetch(detailUrl, {
                    headers: {
                        Authorization: `Bearer ${ACCESS_TOKEN}`,
                        'Accept': 'application/json'
                    }
                });

                // 403 → Stop immediately
                if (detailResponse.status === 403) {
                    const errorBody = await detailResponse.text();
                    logger.error('🛑 Enrichment stopped early due to 403 from Akamai', {
                        merchantId,
                        body: errorBody.substring(0, 400)
                    });
                    blockedCount++;
                    stoppedEarly = true;
                    continue;
                }

                // 404 → Delete merchant (no longer exists)
                if (detailResponse.status === 404) {
                    await pool.request()
                        .input('id', sql.Int, merchantId)
                        .query(`DELETE FROM dbo.AwinHighApprovalMerchants WHERE MerchantId = @id and Joined <> 1`);

                    deletedCount++;
                    logger.info(`🗑️ Deleted merchant ${merchantId} (404 - no longer exists)`);
                    await new Promise(r => setTimeout(r, ENRICHMENT_DELAY_MS));
                    continue;
                }

                if (!detailResponse.ok) {
                    const errorBody = await detailResponse.text();
                    logger.warn(`Failed to fetch detail for merchant ${merchantId}`, {
                        status: detailResponse.status,
                        body: errorBody.substring(0, 300)
                    });
                    await new Promise(r => setTimeout(r, ENRICHMENT_DELAY_MS));
                    continue;
                }

                const detail = await detailResponse.json();

                if (detail.logoUrl || detail.name || detail.primarySector || detail.description) {
                    await pool.request()
                        .input('id', sql.Int, merchantId)
                        .input('name', sql.NVarChar(255), detail.name || null)
                        .input('sector', sql.NVarChar(100), detail.primarySector || null)
                        .input('desc', sql.NVarChar(sql.MAX), detail.description || null)
                        .input('logo', sql.NVarChar(500), detail.logoUrl || null)
                        .query(`
                            UPDATE dbo.AwinHighApprovalMerchants
                            SET 
                                Name          = COALESCE(@name, Name),
                                primarySector = COALESCE(@sector, primarySector),
                                description   = COALESCE(@desc, description),
                                logoUrl       = COALESCE(@logo, logoUrl),
                                LastSynced    = GETDATE()
                            WHERE MerchantId = @id
                        `);

                    enrichedCount++;
                }

                await new Promise(r => setTimeout(r, ENRICHMENT_DELAY_MS));

            } catch (err) {
                logger.warn(`Exception enriching merchant ${merchantId}`, { error: err.message });
                await new Promise(r => setTimeout(r, ENRICHMENT_DELAY_MS));
            }
        }

        logger.info(`✅ Enrichment completed`);
        logger.info(`   Enriched: ${enrichedCount} | Deleted: ${deletedCount} | Stopped on 403: ${blockedCount}`);

        return {
            enriched: enrichedCount,
            deleted: deletedCount,
            blocked: blockedCount,
            stoppedEarly
        };

    } catch (err) {
        logger.error('💥 Enrichment failed', { error: err.message });
        throw err;
    }
}

module.exports = { run };