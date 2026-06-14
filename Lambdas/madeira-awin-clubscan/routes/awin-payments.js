// routes/awin-payments.js
// ✅ FINAL PRODUCTION — Batches using correct `ids` parameter + robust ClubID from clickRef

const { logger, sql } = require('/opt/nodejs/helpers');
const { getAwinConfig } = require('/opt/nodejs/conf/awin-config');

async function run(pool) {
    logger.info('💰 [AwinPayments] FINAL PRODUCTION — All joined merchants');

    const awin = await getAwinConfig();
    const ACCESS_TOKEN = awin.AWIN_ACCESS_TOKEN;

    try {
        // Last 365 days
        const endDate = new Date().toISOString();
        const startObj = new Date();
        startObj.setDate(startObj.getDate() - 365);
        const startDate = startObj.toISOString();

        logger.info(`📅 Date range: ${startDate} → ${endDate}`);

        // Get ALL joined merchants
        const advResult = await pool.request().query(`
            SELECT MerchantId AS AdvertiserId 
            FROM dbo.AwinHighApprovalMerchants 
            WHERE Joined = 1
        `);

        const allIds = advResult.recordset.map(m => m.AdvertiserId);
        logger.info(`📊 Found ${allIds.length} joined merchants`);

        let totalFetched = 0;
        let totalUpserted = 0;
        const BATCH_SIZE = 20;
        const DELAY_MS = 1200;

        for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
            const batch = allIds.slice(i, i + BATCH_SIZE);
            const idsParam = batch.join(',');

            const url = `https://api.awin.com/publishers/${awin.AWIN_PUBLISHER_ID}/transactions?` +
                        `startDate=${startDate}&endDate=${endDate}&` +
                        `dateType=transaction&ids=${idsParam}&timezone=UTC&limit=500`;

            logger.info(`🔍 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allIds.length / BATCH_SIZE)} — ${batch.length} merchants`);

            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Accept': 'application/json'
                }
            });

            if (res.ok) {
                const txs = await res.json();
                logger.info(`✅ Batch returned ${txs.length} transactions`);

                for (const tx of txs) {
                    // === CLUBID FROM CLICKREF (as you requested) ===
                    let clubID = 'UNKNOWN';
                    if (tx.clickRef) {
                        clubID = tx.clickRef.split('|')[0].trim();
                    }

                    await pool.request()
                        .input('AwinID', sql.NVarChar(100), tx.id || tx.transactionId)
                        .input('SellerID', sql.NVarChar(100), tx.advertiserId)
                        .input('ClubID', sql.NVarChar(50), clubID)
                        .input('Comm', sql.Decimal(18,4), parseFloat(tx.commissionAmount) || 0)
                        .input('Sale', sql.Decimal(18,2), parseFloat(tx.saleAmount) || 0)
                        .input('Curr', sql.NVarChar(10), tx.currency || 'GBP')
                        .input('TDate', sql.DateTime2, tx.transactionDate || new Date())
                        .input('Stat', sql.NVarChar(30), tx.commissionStatus || 'approved')
                        .input('PDate', sql.DateTime2, tx.paymentDate || null)
                        .input('OrderRef', sql.NVarChar(100), tx.orderReference || null)
                        .input('Voucher', sql.NVarChar(100), tx.voucherCode || null)
                        .input('ClickRef', sql.NVarChar(200), tx.clickRef || null)
                        .input('Custom', sql.NVarChar(sql.MAX), JSON.stringify(tx))
                        .query(`
                            MERGE dbo.AwinTransactions AS t
                            USING (VALUES (@AwinID, @SellerID, @ClubID, @Comm, @Sale, @Curr, @TDate, @Stat, @PDate, @OrderRef, @Voucher, @ClickRef, @Custom))
                            AS s (AwinTransactionID, SellerID, ClubID, CommissionAmount, SaleAmount, Currency, TransactionDate, CommissionStatus, PaymentDate, OrderReference, VoucherCode, ClickRef, CustomParameters)
                            ON t.AwinTransactionID = s.AwinTransactionID AND t.ClubID = s.ClubID
                            WHEN MATCHED THEN UPDATE SET 
                                CommissionStatus = s.CommissionStatus,
                                PaymentDate = s.PaymentDate,
                                CommissionAmount = s.CommissionAmount,
                                SaleAmount = s.SaleAmount,
                                LastUpdated = GETDATE()
                            WHEN NOT MATCHED THEN INSERT 
                                (AwinTransactionID, SellerID, ClubID, CommissionAmount, SaleAmount, Currency, TransactionDate, CommissionStatus, PaymentDate, OrderReference, VoucherCode, ClickRef, CustomParameters)
                                VALUES (s.AwinTransactionID, s.SellerID, s.ClubID, s.CommissionAmount, s.SaleAmount, s.Currency, s.TransactionDate, s.CommissionStatus, s.PaymentDate, s.OrderReference, s.VoucherCode, s.ClickRef, s.CustomParameters);
                        `);
                    totalUpserted++;
                }
                totalFetched += txs.length;
            } else {
                logger.warn(`⚠️ Batch failed → Status ${res.status}`);
            }

            if (i + BATCH_SIZE < allIds.length) {
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        logger.info(`🎉 AwinPayments COMPLETE — Fetched ${totalFetched} | Upserted ${totalUpserted} records`);
        return {
            statusCode: 200,
            body: `✅ Imported ${totalUpserted} Awin transactions from all joined merchants`
        };

    } catch (err) {
        logger.error('💥 AwinPayments failed', { error: err.message });
        throw err;
    }
}

module.exports = { run };