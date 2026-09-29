// ====================== routes/token/network.js ======================
// Public (unpassworded) route under /token/network

const { logger, getDbConnection, executeWithRetry } = require('/opt/nodejs/helpers');

module.exports = async (event) => {
    const type = (event.queryStringParameters?.type || 'partners').toLowerCase();

    logger.info('🌐 NETWORK ROUTE (Public)', { type });

    const pool = await getDbConnection();

    try {
        // ====================== PARTNERS ======================
        if (type === 'partners') {
            const result = await executeWithRetry(() =>
                pool.request().query(`
                    SELECT
                        p.PartnerID,
                        p.Name,
                        p.Location,
                        p.Website,
                        p.Phone,
                        p.Logo,
                        p.Description,
                        JSON_QUERY(
                            (
                                SELECT TRIM(value) AS [value]
                                FROM STRING_SPLIT(ISNULL(p.Provides, ''), ',')
                                WHERE TRIM(value) <> ''
                                FOR JSON PATH
                            )
                        ) AS Provides,
                        JSON_QUERY(
                            ISNULL(
                                (
                                    SELECT
                                        JSON_VALUE(cs.JsonResult, '$.name') AS Name,
                                        cs.Url,
                                        cs.Screenshot
                                    FROM [madeiradb].[dbo].[clubscan] cs
                                    WHERE cs.PartnerId = p.PartnerID
                                      AND cs.JsonResult IS NOT NULL
                                      AND cs.Screenshot IS NOT NULL
                                    FOR JSON PATH
                                ),
                                '[]'
                            )
                        ) AS Clubs
                    FROM [madeiradb].[dbo].[Partner] p
                    WHERE p.Approved = 1
                    ORDER BY p.Name
                    FOR JSON PATH, ROOT('Partners')
                `)
            );

            const firstRow = result.recordset[0];
            const jsonString = firstRow ? Object.values(firstRow)[0] : null;

            return {
                statusCode: 200,
                body: jsonString || JSON.stringify({ Partners: [] })
            };
        }

        // ====================== CLUBS (Rich format) ======================
        if (type === 'clubs') {
            const result = await executeWithRetry(() =>
                pool.request().query(`
                    SELECT 
                        ClubID,
                        Name,
                        Location,
                        Url,
                        Sector,
                        Review,
                        PartnerId,
                        PartnerName,
                        PartnerLogo,
                        PartnerWebsite,
                        PartnerDescription,
                        PartnerApproved,
                        Screenshot,
                        Comment,
                        Audience,
                        Interests
                    FROM dbo.Clubs()
                    WHERE Screenshot IS NOT NULL
                    FOR JSON PATH, ROOT('Clubs')
                `)
            );

            const firstRow = result.recordset[0];
            const jsonString = firstRow ? Object.values(firstRow)[0] : null;

            return {
                statusCode: 200,
                body: jsonString || JSON.stringify({ Clubs: [] })
            };
        }

        // ====================== MERCHANTS ======================
        if (type === 'merchants') {
            const result = await executeWithRetry(() =>
                pool.request().query(`
                    SELECT
                        primarySector AS sector,
                        (
                            SELECT
                                Name AS name,
                                description,
                                logoUrl
                            FROM [madeiradb].[dbo].[AwinHighApprovalMerchants] m2
                            WHERE m2.primarySector = m1.primarySector
                              AND m2.logoUrl IS NOT NULL
                            ORDER BY Name
                            FOR JSON PATH
                        ) AS merchants
                    FROM
                    (
                        SELECT DISTINCT primarySector
                        FROM [madeiradb].[dbo].[AwinHighApprovalMerchants]
                        WHERE logoUrl IS NOT NULL
                          AND primarySector <> 'Erotic'
                    ) m1
                    ORDER BY primarySector
                    FOR JSON PATH, ROOT('sectors')
                `)
            );

            const firstRow = result.recordset[0];
            const jsonString = firstRow ? Object.values(firstRow)[0] : null;

            return {
                statusCode: 200,
                body: jsonString || JSON.stringify({ sectors: [] })
            };
        }

        // ====================== DISCOUNT / VOUCHERS ======================
        if (type === 'discount' || type === 'vouchers' || type === 'deals') {
            const result = await executeWithRetry(() =>
                pool.request().query(`
                    SELECT 
                        primarySector,
                        (
                            SELECT 
                                m.MerchantId,
                                m.Name,
                                m.logoUrl,
                                m.description AS merchantDescription,
                                m.Website,
                                (
                                    SELECT 
                                        v.VoucherCode,
                                        v.Description AS dealDescription,
                                        v.TrackingUrl,
                                        v.StartDate,
                                        v.EndDate,
                                        v.Title,
                                        v.Terms,
                                        v.Status,
                                        v.VoucherExclusive,
                                        v.VoucherAttributable
                                    FROM dbo.AwinVoucher v
                                    WHERE v.MerchantId = m.MerchantId
                                      AND v.EndDate > GETDATE()
                                      AND v.Description NOT LIKE '%Affiliates prohibited.%'
                                    ORDER BY v.EndDate ASC
                                    FOR JSON PATH
                                ) AS deals
                            FROM dbo.AwinHighApprovalMerchants m
                            WHERE m.primarySector = ps.primarySector
                              AND m.Joined = 1
                              AND EXISTS (
                                  SELECT 1 
                                  FROM dbo.AwinVoucher v2 
                                  WHERE v2.MerchantId = m.MerchantId 
                                    AND v2.EndDate > GETDATE()
                                    AND v2.Description NOT LIKE '%Affiliates prohibited.%'
                              )
                            ORDER BY m.Name
                            FOR JSON PATH
                        ) AS merchants
                    FROM 
                    (
                        SELECT DISTINCT primarySector 
                        FROM dbo.AwinHighApprovalMerchants m
                        WHERE m.Joined = 1
                          AND EXISTS (
                              SELECT 1 
                              FROM dbo.AwinVoucher v 
                              WHERE v.MerchantId = m.MerchantId 
                                AND v.EndDate > GETDATE()
                                AND v.Description NOT LIKE '%Affiliates prohibited.%'
                          )
                    ) AS ps
                    ORDER BY primarySector
                    FOR JSON PATH, ROOT('sectors')
                `)
            );

            const firstRow = result.recordset[0];
            const jsonString = firstRow ? Object.values(firstRow)[0] : null;

            return {
                statusCode: 200,
                body: jsonString || JSON.stringify({ sectors: [] })
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({
                status: 'error',
                error_message: 'Invalid type. Use: partners, clubs, merchants, or discount'
            })
        };

    } catch (error) {
        logger.error('Network route failed', { type, error: error.message });
        return {
            statusCode: 500,
            body: JSON.stringify({
                status: 'error',
                error_message: 'Failed to retrieve network data'
            })
        };
    }
};