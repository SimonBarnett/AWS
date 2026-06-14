// ====================== sqs/clubscan/build-catalog.js ======================
// Builds Catalog table from UserCategories.json_categories
// Saves SearchTerms + RelevantKeywords + IrrelevantKeywords + Notes
// Cleans up old/stale categories (including those with NULL ProcessedBatchId)
// Triggers CLUBSCAN_NOTIFY during onboarding (when enqueueNotify === true)
// Automatically records errors in LastError on failure
// Last updated: 14 June 2026

const { v4: uuidv4 } = require('uuid');

const {
    logger,
    enqueueMessage,
    sql
} = require('/opt/nodejs/helpers');

const { withStatusHandling } = require('./helpers');

async function handle(event) {
    const { sandbox, enqueueNotify } = event;

    return withStatusHandling(event, async ({ pool, url }) => {

        // Get ClubID using the shared pool
        const clubResult = await pool.request()
            .input('url', sql.NVarChar, url)
            .query('SELECT ClubID FROM clubscan WHERE Url = @url');

        const row = clubResult.recordset[0];
        if (!row) {
            throw new Error('Club record not found in clubscan');
        }

        const userId = row.ClubID;

        // Read categories from UserCategories using the shared pool
        const catResult = await pool.request()
            .input('uid', sql.VarChar, userId)
            .query(`
                SELECT TOP 1 json_categories 
                FROM UserCategories 
                WHERE uid = @uid 
                ORDER BY LastUpdate DESC
            `);

        const jsonCategories = catResult.recordset[0]?.json_categories;
        if (!jsonCategories) {
            throw new Error('No categories found in UserCategories');
        }

        let categories;
        try {
            categories = JSON.parse(jsonCategories);
        } catch (e) {
            throw new Error(`Failed to parse json_categories: ${e.message}`);
        }

        logger.info('Starting catalog build from UserCategories', { 
            url, 
            userId, 
            categoryCount: Object.keys(categories).length 
        });

        // Build Catalog table using the shared pool
        const startTimeResult = await pool.request().query('SELECT GETDATE() AS startTime');
        const startTime = startTimeResult.recordset[0].startTime;

        const batchId = uuidv4();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const [mainCategory, data] of Object.entries(categories)) {
                const icon = data.icon || '';
                const mainCategoryOrder = data.MainCategoryOrder || 999;
                const subcategories = data.subcategories || [];

                for (const sub of subcategories) {
                    const subCategoryOrder = sub.SubCategoryOrder || 999;

                    const searchTermsJson    = JSON.stringify(sub.searchTerms || []);
                    const relevantKeywords   = JSON.stringify(sub.meta?.relevantKeywords || []);
                    const irrelevantKeywords = JSON.stringify(sub.meta?.irrelevantKeywords || []);
                    const notes              = sub.meta?.notes || '';

                    await transaction.request()
                        .input('UserId', sql.NVarChar, userId)
                        .input('MainCategory', sql.NVarChar, mainCategory)
                        .input('SubCategory', sql.NVarChar, sub.name)
                        .input('Icon', sql.NVarChar, icon)
                        .input('Created', sql.DateTime, startTime)
                        .input('LastUpdate', sql.DateTime, startTime)
                        .input('MainCategoryOrder', sql.Int, mainCategoryOrder)
                        .input('SubCategoryOrder', sql.Int, subCategoryOrder)
                        .input('SearchTerms', sql.NVarChar(sql.MAX), searchTermsJson)
                        .input('RelevantKeywords', sql.NVarChar(sql.MAX), relevantKeywords)
                        .input('IrrelevantKeywords', sql.NVarChar(sql.MAX), irrelevantKeywords)
                        .input('Notes', sql.NVarChar(sql.MAX), notes)
                        .input('ProcessedBatchId', sql.NVarChar, batchId)
                        .query(`
                            MERGE Catalog AS target
                            USING (SELECT @UserId AS UserId, @MainCategory AS MainCategory, @SubCategory AS SubCategory) AS source
                            ON target.UserId = source.UserId 
                               AND target.MainCategory = source.MainCategory 
                               AND target.SubCategory = source.SubCategory
                            WHEN MATCHED THEN 
                                UPDATE SET 
                                    Icon = @Icon, 
                                    LastUpdate = @LastUpdate, 
                                    MainCategoryOrder = @MainCategoryOrder, 
                                    SubCategoryOrder = @SubCategoryOrder,
                                    SearchTerms = @SearchTerms,
                                    RelevantKeywords = @RelevantKeywords,
                                    IrrelevantKeywords = @IrrelevantKeywords,
                                    Notes = @Notes,
                                    ProcessedBatchId = @ProcessedBatchId
                            WHEN NOT MATCHED THEN 
                                INSERT (UserId, MainCategory, SubCategory, Icon, Created, LastUpdate, 
                                        MainCategoryOrder, SubCategoryOrder, 
                                        SearchTerms, RelevantKeywords, IrrelevantKeywords, Notes, 
                                        ProcessedBatchId)
                                VALUES (@UserId, @MainCategory, @SubCategory, @Icon, @Created, @LastUpdate, 
                                        @MainCategoryOrder, @SubCategoryOrder, 
                                        @SearchTerms, @RelevantKeywords, @IrrelevantKeywords, @Notes, 
                                        @ProcessedBatchId);
                        `);
                }
            }

            await transaction.commit();
            logger.info('✅ Catalog table updated successfully', { userId, batchId });

            // Cleanup old/stale records
            const deleteResult = await pool.request()
                .input('userId', sql.VarChar, userId)
                .input('batchId', sql.NVarChar, batchId)
                .query(`
                    DELETE FROM Catalog 
                    WHERE UserId = @userId 
                      AND (ProcessedBatchId IS NULL OR ProcessedBatchId != @batchId)
                `);

            logger.info(`🧹 Cleaned up ${deleteResult.rowsAffected[0]} stale catalog records`, { userId });

            // ====================== ENQUEUE NEXT STEP ======================
            const isSandbox = sandbox === true;

            if (!isSandbox) {
                if (enqueueNotify === true) {
                    // Onboarding flow - notify will be handled by CLUBSCAN_NOTIFY
                    await enqueueMessage({
                        type: 'CLUBSCAN_NOTIFY',
                        url
                    });
                    logger.info('✅ Catalog build complete (onboarding). Triggered CLUBSCAN_NOTIFY', { url });
                } else {
                    // Normal category update - do not notify here
                    logger.info('✅ Catalog build complete (no notify enqueued)', { url });
                }
            } else {
                logger.info('Sandbox mode enabled - skipping notify', { url });
            }

        } catch (err) {
            await transaction.rollback();
            logger.error('Catalog build transaction failed', { userId, error: err.message });
            throw err;
        }

    }, {
        startStatus: 'building_catalog',
        successStatus: enqueueNotify === true ? 'catalog_complete' : 'complete'
    });
}

module.exports = { handle };