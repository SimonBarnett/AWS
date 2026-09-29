// routes/sync-vouchers.js
const { logger, sql } = require('/opt/nodejs/helpers');
const { getAwinConfig } = require('/opt/nodejs/conf/awin-config');

async function run(pool) {
    logger.info('🔄 Starting Awin Vouchers Sync (Per Merchant - 2s delay)');

    try {
        const awin = await getAwinConfig();
        const PUBLISHER_ID = awin.AWIN_PUBLISHER_ID;
        const ACCESS_TOKEN = awin.AWIN_ACCESS_TOKEN;

        if (!ACCESS_TOKEN) {
            throw new Error('AWIN_ACCESS_TOKEN is missing from config');
        }

        // Get all joined merchants
        const merchantsResult = await pool.request().query(`
            SELECT MerchantId, Name 
            FROM dbo.AwinHighApprovalMerchants 
            WHERE Joined = 1
            ORDER BY MerchantId
        `);

        const merchants = merchantsResult.recordset;
        logger.info(`Found ${merchants.length} joined merchants to sync vouchers for`);

        let totalSaved = 0;
        const DELAY_MS = 2000; // 2 seconds between calls

        for (const merchant of merchants) {
            try {
                const url = `https://api.awin.com/publisher/${PUBLISHER_ID}/promotions?accessToken=${ACCESS_TOKEN}`;

                const body = {
                    filters: {
                        advertiserIds: [merchant.MerchantId],
                        membership: "joined",
                        type: "voucher",
                        status: "active"
                    },
                    pagination: {
                        page: 1,
                        pageSize: 200
                    }
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${ACCESS_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    logger.warn(`Failed to fetch vouchers for ${merchant.Name} (${merchant.MerchantId})`, {
                        status: response.status
                    });
                    await new Promise(r => setTimeout(r, DELAY_MS));
                    continue;
                }

                const data = await response.json();
                const offers = data.data || [];

                if (offers.length > 0) {
                    logger.info(`Found ${offers.length} vouchers for ${merchant.Name} (${merchant.MerchantId})`);
                }

                for (const offer of offers) {
                    try {
                        const voucher = offer.voucher || {};
                        const regions = offer.regions || {};
                        const regionsList = regions.list ? JSON.stringify(regions.list) : null;

                        await pool.request()
                            .input('awinOfferId', sql.BigInt, offer.promotionId)
                            .input('merchantId', sql.Int, merchant.MerchantId)
                            .input('merchantName', sql.NVarChar(255), merchant.Name)
                            .input('voucherCode', sql.NVarChar(100), voucher.code || null)
                            .input('description', sql.NVarChar(sql.MAX), offer.description || offer.title || null)
                            .input('startDate', sql.DateTime2, offer.startDate ? new Date(offer.startDate) : null)
                            .input('endDate', sql.DateTime2, offer.endDate ? new Date(offer.endDate) : null)
                            .input('promotionType', sql.NVarChar(50), offer.type || 'voucher')
                            .input('trackingUrl', sql.NVarChar(1000), offer.urlTracking || null)
                            // New columns
                            .input('title', sql.NVarChar(500), offer.title || null)
                            .input('terms', sql.NVarChar(sql.MAX), offer.terms || null)
                            .input('status', sql.NVarChar(50), offer.status || null)
                            .input('url', sql.NVarChar(1000), offer.url || null)
                            .input('dateAdded', sql.DateTime2, offer.dateAdded ? new Date(offer.dateAdded) : null)
                            .input('campaign', sql.NVarChar(255), offer.campaign || null)
                            .input('regionsAll', sql.Bit, regions.all === true ? 1 : 0)
                            .input('regions', sql.NVarChar(sql.MAX), regionsList)
                            .input('categories', sql.NVarChar(sql.MAX), offer.categories ? JSON.stringify(offer.categories) : null)
                            .input('voucherExclusive', sql.Bit, voucher.exclusive === true ? 1 : 0)
                            .input('voucherAttributable', sql.Bit, voucher.attributable === true ? 1 : 0)
                            .query(`
                                MERGE dbo.AwinVoucher AS target
                                USING (SELECT @awinOfferId AS AwinOfferId) AS source
                                ON target.AwinOfferId = source.AwinOfferId
                                WHEN MATCHED THEN
                                    UPDATE SET 
                                        MerchantId           = @merchantId,
                                        MerchantName         = @merchantName,
                                        VoucherCode          = @voucherCode,
                                        Description          = @description,
                                        StartDate            = @startDate,
                                        EndDate              = @endDate,
                                        PromotionType        = @promotionType,
                                        TrackingUrl          = @trackingUrl,
                                        Title                = @title,
                                        Terms                = @terms,
                                        Status               = @status,
                                        Url                  = @url,
                                        DateAdded            = @dateAdded,
                                        Campaign             = @campaign,
                                        RegionsAll           = @regionsAll,
                                        Regions              = @regions,
                                        Categories           = @categories,
                                        VoucherExclusive     = @voucherExclusive,
                                        VoucherAttributable  = @voucherAttributable,
                                        LastSynced           = GETDATE(),
                                        UpdatedAt            = GETDATE()
                                WHEN NOT MATCHED THEN
                                    INSERT (
                                        AwinOfferId, MerchantId, MerchantName, VoucherCode, Description,
                                        StartDate, EndDate, PromotionType, TrackingUrl,
                                        Title, Terms, Status, Url, DateAdded, Campaign,
                                        RegionsAll, Regions, Categories,
                                        VoucherExclusive, VoucherAttributable,
                                        LastSynced, CreatedAt, UpdatedAt
                                    )
                                    VALUES (
                                        @awinOfferId, @merchantId, @merchantName, @voucherCode, @description,
                                        @startDate, @endDate, @promotionType, @trackingUrl,
                                        @title, @terms, @status, @url, @dateAdded, @campaign,
                                        @regionsAll, @regions, @categories,
                                        @voucherExclusive, @voucherAttributable,
                                        GETDATE(), GETDATE(), GETDATE()
                                    );
                            `);

                        totalSaved++;
                    } catch (err) {
                        logger.warn(`Failed to save voucher ${offer.promotionId}`, { error: err.message });
                    }
                }

            } catch (err) {
                logger.warn(`Error processing merchant ${merchant.MerchantId}`, { error: err.message });
            }

            // 2 second delay between merchants
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }

        logger.info(`✅ Awin Vouchers sync completed. Total vouchers saved: ${totalSaved}`);
        return { synced: totalSaved };

    } catch (err) {
        logger.error('💥 Awin Vouchers sync failed', { error: err.message });
        throw err;
    }
}

module.exports = { run };