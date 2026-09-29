// sqs/scheduler.js
// FIXED VERSION - Supports optional event for TOP override + 150ms delay
// Fixed: Invalid column name 'UserId' error (RecentUsers CTE was selecting ClubID but joining on UserId)
// Updated: 28 June 2026

const {
    sql,
    logger,
    enqueueMessage
} = require('/opt/nodejs/helpers');

const AFFILIATES = (process.env.AFFILIATES || 'awin,paapi,ebay')
    .split(',')
    .map(a => a.trim().toLowerCase())
    .filter(Boolean);

const ENQUEUE_DELAY_MS = 150;

async function run(pool, event = {}) {
    if (!pool) {
        logger.error('🚨 Scheduler received no database pool – aborting');
        throw new Error('Database pool is required for scheduler');
    }

    logger.info('🚀 Scheduler started – Per-affiliate staleness + automatic backfill');

    try {
        const MIN_AGE_HOURS = parseInt(process.env.MIN_AGE_HOURS, 10) || 48;
        logger.info(`📊 Using MIN_AGE_HOURS = ${MIN_AGE_HOURS}`);

        // ====================== AUTOMATIC BACKFILL ======================
        logger.info('🔧 Backfilling any missing CatalogAffiliateUpdates rows...');

        const backfillResult = await pool.request().query(`
            INSERT INTO dbo.CatalogAffiliateUpdates (CatalogId, AffiliateKey, LastUpdate)
            SELECT
                c.ID,
                a.AffiliateKey,
                '1900-01-01'
            FROM Catalog c
            CROSS JOIN (VALUES ${AFFILIATES.map(a => `('${a}')`).join(',')}) AS a(AffiliateKey)
            WHERE NOT EXISTS (
                SELECT 1
                FROM dbo.CatalogAffiliateUpdates cau
                WHERE cau.CatalogId = c.ID
                  AND cau.AffiliateKey = a.AffiliateKey
            );
        `);

        logger.info(`✅ Backfilled ${backfillResult?.rowsAffected?.[0] || 0} missing rows`);

        // ====================== MAIN QUERY ======================
        const affiliateList = AFFILIATES.map(a => `'${a}'`).join(',');

        // TOP can be overridden via event.TOP, otherwise use env var (default 5)
        const topCount = event?.TOP ?? parseInt(process.env.TOP || '5', 10);
        const safeTopCount = Number.isInteger(topCount) && topCount > 0 ? topCount : 5;

        logger.info(`📊 Using TOP = ${safeTopCount}${event?.TOP ? ' (overridden via event)' : ''}`);

        const stalePairsResult = await pool.request()
            .input('topCount', safeTopCount)
            .input('minAgeHours', MIN_AGE_HOURS)
            .query(`
            WITH RecentUsers AS (
                SELECT DISTINCT ClubID
                FROM [madeiradb].[dbo].[clubscan]
                WHERE active = 1
            )
            SELECT TOP (@topCount)
                c.ID as catalogId,
                c.UserId,
                c.MainCategory,
                c.SubCategory,
                c.SearchTerms,
                cau.AffiliateKey,
                DATEDIFF(hour, ISNULL(cau.LastUpdate, '1900-01-01'), GETDATE()) AS HoursSinceLastUpdate
            FROM Catalog c
            INNER JOIN RecentUsers ru ON ru.ClubID = c.UserId
            INNER JOIN [madeiradb].[dbo].[clubscan] cs ON cs.ClubID = c.UserId
            INNER JOIN dbo.CatalogAffiliateUpdates cau ON cau.CatalogId = c.ID
            WHERE cau.AffiliateKey IN (${affiliateList})
              AND DATEDIFF(hour, ISNULL(cau.LastUpdate, '1900-01-01'), GETDATE()) >= @minAgeHours
              AND cs.Status = 'completed'
            ORDER BY HoursSinceLastUpdate DESC, c.ID ASC, cau.AffiliateKey ASC
        `);

        const stalePairs = stalePairsResult.recordset;

        logger.info(`📋 Found ${stalePairs.length} (catalog + affiliate) pairs due for processing`);

        if (stalePairs.length === 0) {
            logger.info('✅ No affiliate-category pairs currently due');
            return { statusCode: 200, body: 'No due pairs' };
        }

        let enqueuedCount = 0;

        for (const pair of stalePairs) {
            // Mark as processed immediately
            await pool.request()
                .input('catId', sql.Int, pair.catalogId)
                .input('aff', sql.NVarChar(50), pair.AffiliateKey)
                .query(`
                    MERGE dbo.CatalogAffiliateUpdates AS target
                    USING (VALUES (@catId, @aff)) AS source (CatalogId, AffiliateKey)
                    ON target.CatalogId = source.CatalogId
                       AND target.AffiliateKey = source.AffiliateKey
                    WHEN MATCHED THEN
                        UPDATE SET LastUpdate = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (CatalogId, AffiliateKey, LastUpdate)
                        VALUES (source.CatalogId, source.AffiliateKey, GETDATE());
                `);

            const logInfo = {
                catalogId: pair.catalogId,
                affiliate: pair.AffiliateKey,
                category: `${pair.MainCategory} / ${pair.SubCategory}`,
                hoursStale: pair.HoursSinceLastUpdate
            };

            logger.info('🚀 Enqueuing PROCESS_CATEGORY', logInfo);
            await enqueueMessage({
                type: "PROCESS_CATEGORY",
                affiliate: pair.AffiliateKey,
                catalogId: pair.catalogId,
                userId: pair.UserId,
                category: pair.MainCategory,
                subcategory: pair.SubCategory,
                searchterms: pair.SearchTerms
            });

            enqueuedCount++;

            // 150ms delay between enqueues
            logger.debug(`⏳ Delaying ${ENQUEUE_DELAY_MS}ms before next enqueue`);
            await new Promise(resolve => setTimeout(resolve, ENQUEUE_DELAY_MS));
        }

        logger.info(`✅ Scheduler completed – enqueued ${enqueuedCount} jobs`);
        return { statusCode: 200, body: `Enqueued ${enqueuedCount} jobs` };

    } catch (err) {
        logger.error('💥 Scheduler failed', { error: err.message, stack: err.stack });
        throw err;
    }
}

module.exports = { run };