// ====================== routes/ui/merchantParts.js ======================
const { logger, executeWithRetry, sql } = require('/opt/nodejs/helpers');

module.exports = async (event, { pool, sandbox = false } = {}) => {
    const decoded = event.decoded;
    const userId = decoded?.user_id;

    try {
        const queryParams = event.queryStringParameters || {};
        let page = parseInt(queryParams.page, 10) || 1;
        let pageLen = parseInt(queryParams.pagelen, 10) || 50;

        if (page < 1) page = 1;
        if (pageLen < 1) pageLen = 50;
        if (pageLen > 200) pageLen = 200;

        const offset = (page - 1) * pageLen;

        // Get total count
        const countResult = await executeWithRetry(() =>
            pool.request()
                .input('UserId', sql.VarChar, userId)
                .query(`
                    SELECT COUNT(*) AS total
                    FROM (
                        SELECT DISTINCT mp.ASIN
                        FROM dbo.MerchantProducts mp
                        WHERE mp.UserId = @UserId
                    ) AS UniqueProducts
                `)
        );

        const totalRecords = countResult.recordset[0].total || 0;

        // Fetch paginated data
        const result = await executeWithRetry(() =>
            pool.request()
                .input('UserId', sql.VarChar, userId)
                .input('Offset', sql.Int, offset)
                .input('PageLen', sql.Int, pageLen)
                .query(`
                    WITH RankedProducts AS (
                        SELECT 
                            mp.*, 
                            mc.SubCategory AS MerchantCatalog_SubCategory,
                            c.SubCategoryOrder AS Catalog_SubCategoryOrder,
                            ISNULL((
                                SELECT COUNT(*) 
                                FROM MerchantCatalog mc2 
                                WHERE mc2.ASIN = mp.ASIN 
                                AND mc2.MerchantID = @UserId
                            ), 0) AS count_categories,
                            ROW_NUMBER() OVER (
                                PARTITION BY mp.ASIN 
                                ORDER BY 
                                    CASE WHEN mc.SubCategory IS NOT NULL THEN 1 ELSE 2 END,
                                    mp.LastUpdate DESC
                            ) AS rn
                        FROM dbo.MerchantProducts mp
                        LEFT JOIN dbo.MerchantCatalog mc 
                            ON mc.MerchantID = mp.UserId 
                            AND mc.ASIN = mp.ASIN
                        LEFT JOIN dbo.Catalog c 
                            ON c.UserId = @UserId 
                            AND c.MainCategory = mc.MainCategory 
                            AND c.SubCategory = mc.SubCategory
                        WHERE mp.UserId = @UserId
                    )
                    SELECT 
                        ID, UserId, Category, Subcategory, ASIN, Source, Title, Price, Discount,
                        WasPrice, AffiliateUrl, ThumbnailUrl, CategoryId, CategoryName, Mpn, Brand,
                        Features, Specifications, Created, LastUpdate, ProcessedBatchId, count_categories
                    FROM RankedProducts
                    WHERE rn = 1
                    ORDER BY LastUpdate DESC, Title ASC
                    OFFSET @Offset ROWS
                    FETCH NEXT @PageLen ROWS ONLY;
                `)
        );

        if (sandbox) logger.debug('[SANDBOX] merchantParts fetched', { userId, page, pageLen });

        logger.info('Successfully fetched merchant parts', { userId, page, pageLen, totalRecords });

        return {
            statusCode: 200,
            body: {
                recordcount: totalRecords,
                data: result.recordset
            }
        };

    } catch (error) {
        logger.error('Error fetching merchant parts', { error: error.message, userId });
        return { statusCode: 500, body: { message: 'Internal server error' } };
    }
};