// routes/onboarding.js
const { logger, getDbConnection, sql } = require('/opt/nodejs/helpers');
const { sendMail } = require('/opt/nodejs/mailer');
const { getAwinConfig } = require('/opt/nodejs/conf/awin-config');

// Import Awin-specific function from local helpers
const { createAwinMerchantUser } = require('../helpers');

let AWIN_CONFIG = null;

async function getAwinCredentials() {
    if (!AWIN_CONFIG) {
        AWIN_CONFIG = await getAwinConfig();
    }
    return AWIN_CONFIG;
}

// ====================== MAIN HANDLER ======================
exports.handler = async (event, { pool: passedPool } = {}) => {
    const sandbox = event.sandbox === true;
    const newAdvertisers = [];

    const awin = await getAwinCredentials();
    const PUBLISHER_ID = awin.AWIN_PUBLISHER_ID;
    const ACCESS_TOKEN = awin.AWIN_ACCESS_TOKEN;
    const NOTIFICATION_EMAIL_TO = process.env.NOTIFICATION_EMAIL_TO || 'stakeholder@clubmadeira.uk';

    let pool = passedPool;
    let shouldClosePool = false;

    try {
        if (!pool) {
            pool = await getDbConnection();
            shouldClosePool = true;
        }

        if (!sandbox) {
            const programmes = await getJoinedProgrammes(PUBLISHER_ID, ACCESS_TOKEN);
            logger.info(`Fetched ${programmes.length} joined Awin programmes`);

            for (const prog of programmes) {
                const name = prog.name?.trim() || 'Unknown Advertiser';
                const advertiserId = String(prog.id);
                const email = prog.contactEmail || prog.email || prog.primaryContactEmail || `${advertiserId}@awin.com`;
                const website = prog.displayUrl || prog.website || prog.siteUrl || '';
                const logoUrl = prog.logoUrl || '';
                const primarySector = prog.primarySector || '';
                const description = prog.description || '';

                if (await emailAlreadyExists(pool, email)) continue;

                const user = await createAwinMerchantUser(pool, { advertiserId, name, website });
                await updateAwinUserId(pool, advertiserId, user.userId);

                newAdvertisers.push({
                    user_id: user.userId,
                    company_name: name,
                    email: user.email,
                    website: website,
                    logoUrl: logoUrl,
                    primarySector: primarySector,
                    description: description
                });
            }
        } else {
            logger.info('🧪 SANDBOX MODE – Selecting 8 random joined merchants + generating test sales');
            const randomMerchants = await getSandboxMerchants(pool);
            newAdvertisers.push(...randomMerchants);

            await generateSandboxSales(pool, randomMerchants);
        }

        // ====================== STATS & LAST 24H SALES ======================
        const stats = await getAwinStats(pool);
        const last24hSales = await getLast24hAwinSales(pool);

        // ====================== ALWAYS SEND REPORT ======================
        const emailTo = sandbox ? 'si@ntsa.uk' : NOTIFICATION_EMAIL_TO;
        const projectedTotalMerchants = stats.totalAwinMerchants + (sandbox ? 0 : newAdvertisers.length);

        // New Merchants Table
        const newTableRows = newAdvertisers
            .map(a => {
                const emailValue = a.email || `${a.id}@awin.com`;
                const loginLink = `https://partner.clubmadeira.io/login.html?uid=${encodeURIComponent(emailValue)}`;
                const logoHtml = a.logoUrl
                    ? `<a href="${a.website || '#'}" target="_blank"><img src="${a.logoUrl}" alt="${a.company_name}" style="max-height:60px; max-width:140px;"></a><br><small>${a.primarySector || ''}</small>`
                    : `<strong>${a.company_name}</strong>`;

                return `<tr><td style="text-align:center;">${logoHtml}</td><td>${a.description ? a.description.substring(0, 150) + '...' : '—'}</td><td><a href="${loginLink}" target="_blank">${emailValue}</a></td></tr>`;
            })
            .join('');

        const newMerchantsTable = newAdvertisers.length > 0
            ? `<h3>New Awin Merchants Onboarded Today (${newAdvertisers.length})</h3><table border="1" cellpadding="8" style="border-collapse:collapse; width:100%;"><thead><tr style="background:#f0f0f0;"><th>Company</th><th>Description</th><th>Email</th></tr></thead><tbody>${newTableRows}</tbody></table>`
            : `<p><em>No new merchants onboarded today.</em></p>`;

        // Last 24h Sales + Currency Totals (kept exactly as before)
        const salesRows = last24hSales.map(s => `
            <tr>
                <td>${s.ClubID}</td>
                <td>${s.AdvertiserName || '—'}</td>
                <td style="text-align:right;">${parseFloat(s.SaleAmount || 0).toLocaleString()} ${s.Currency}</td>
                <td style="text-align:right;">${parseFloat(s.CommissionAmount || 0).toLocaleString()} ${s.Currency}</td>
                <td>${s.Currency}</td>
            </tr>`).join('');

        const currencyTotals = {};
        last24hSales.forEach(s => {
            const curr = s.Currency || 'GBP';
            if (!currencyTotals[curr]) currencyTotals[curr] = { totalSale: 0, totalCommission: 0 };
            currencyTotals[curr].totalSale += parseFloat(s.SaleAmount || 0);
            currencyTotals[curr].totalCommission += parseFloat(s.CommissionAmount || 0);
        });

        const currencyTotalRows = Object.keys(currencyTotals).map(curr => {
            const t = currencyTotals[curr];
            return `
                <tr style="background:#e6f0ff; font-weight:bold;">
                    <td colspan="2" style="text-align:right;">TOTAL ${curr}</td>
                    <td style="text-align:right;">${t.totalSale.toLocaleString()} ${curr}</td>
                    <td style="text-align:right;">${t.totalCommission.toLocaleString()} ${curr}</td>
                    <td>${curr}</td>
                </tr>`;
        }).join('');

        const salesHtml = last24hSales.length > 0
            ? `<h3>Awin Sales - Last 24 Hours (${last24hSales.length} transactions)</h3>
               <table border="1" cellpadding="8" style="border-collapse:collapse; width:100%; font-size:14px;">
                   <thead><tr style="background:#f0f0f0;">
                       <th>ClubID</th><th>AdvertiserName</th>
                       <th style="text-align:right;">Sale Amount</th>
                       <th style="text-align:right;">Commission</th>
                       <th>Currency</th>
                   </tr></thead>
                   <tbody>${salesRows}</tbody>
                   <tfoot>${currencyTotalRows}</tfoot>
               </table>`
            : `<p><em>No sales in the last 24 hours.</em></p>`;

        // Top 10 Merchants
        const topTableRows = stats.topMerchants.map(m => {
            const logoHtml = m.logoUrl
                ? `<a href="${m.website || '#'}" target="_blank"><img src="${m.logoUrl}" alt="${m.company_name}" style="max-height:60px; max-width:140px;"></a><br><small>${m.primarySector || ''}</small>`
                : `<strong>${m.company_name}</strong>`;
            return `<tr><td style="text-align:center;">${logoHtml}</td><td>${m.description ? m.description.substring(0, 150) + '...' : '—'}</td><td style="text-align:right; font-weight:bold;">${m.merchant_parts_count.toLocaleString()}</td></tr>`;
        }).join('');

        const topMerchantsHtml = `
            <h3>Top 10 Awin Merchants by Product Count</h3>
            <table border="1" cellpadding="8" style="border-collapse:collapse; width:100%;">
                <thead><tr style="background:#f0f0f0;"><th>Company</th><th>Description</th><th>Parts Count</th></tr></thead>
                <tbody>${topTableRows}</tbody>
            </table>`;

        const sandboxBanner = sandbox
            ? `<div style="background:#ff9800; color:#fff; padding:15px; text-align:center; font-weight:bold;">🚨 SANDBOX MODE — Test data generated</div>`
            : '';

        const mailOptions = {
            from: 'support@clubmadeira.uk',
            to: emailTo,
            subject: `${sandbox ? '[SANDBOX TEST] ' : ''}Daily Awin Report - ${new Date().toISOString().split('T')[0]}`,
            html: `
                ${sandboxBanner}
                <h2>Daily Awin Report</h2>
                <p><strong>Generated at:</strong> ${new Date().toISOString()}</p>
                <hr>
                <h3>Overall Awin Statistics</h3>
                <ul>
                    <li><strong>Total Awin Merchants:</strong> ${projectedTotalMerchants.toLocaleString()}</li>
                    <li><strong>Total Awin Products:</strong> ${stats.totalAwinParts.toLocaleString()}</li>
                </ul>
                <hr>
                ${salesHtml}
                <hr>
                ${newMerchantsTable}
                <hr>
                ${topMerchantsHtml}
                <hr>
                <p style="font-size:12px; color:#666;">Automated daily report from madeira-awin-clubscan.</p>
            `
        };

        await sendMail(mailOptions);
        logger.info(`✅ Daily report sent successfully to ${emailTo}`);

        return { statusCode: 200 };

    } catch (error) {
        logger.error(`Awin onboarding failed: ${error.message}`, { stack: error.stack });
        throw error;
    } finally {
        if (shouldClosePool && pool) {
            await pool.close().catch(() => {});
        }
    }
};

// ====================== HELPER FUNCTIONS (updated to accept pool) ======================

async function getJoinedProgrammes(publisherId, accessToken) {
    const url = `https://api.awin.com/publishers/${publisherId}/programmes?relationship=joined`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Awin API error: ${response.status}`);
    return await response.json();
}

async function emailAlreadyExists(pool, email) {
    try {
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .query(`SELECT 1 FROM Users WHERE email_address = @email`);
        return result.recordset.length > 0;
    } catch (error) {
        logger.error('Failed to check if email exists', { email, error: error.message });
        return false;
    }
}

async function updateAwinUserId(pool, merchantId, userId) {
    try {
        await pool.request()
            .input('merchantId', sql.BigInt, merchantId)
            .input('userId', sql.VarChar(20), userId)
            .query(`UPDATE dbo.AwinHighApprovalMerchants SET AwinUserId = @userId WHERE MerchantId = @merchantId`);
    } catch (error) {
        logger.error('Failed to update AwinUserId', { merchantId, userId, error: error.message });
    }
}

async function getSandboxMerchants(pool) {
    try {
        const result = await pool.request().query(`
            SELECT TOP 8
                MerchantId as id,
                Name as company_name,
                Email as email,
                Website as website,
                logoUrl,
                primarySector,
                description
            FROM dbo.AwinHighApprovalMerchants
            WHERE Joined = 1
            ORDER BY NEWID()
        `);
        return result.recordset || [];
    } catch (error) {
        logger.error('Failed to get sandbox merchants', { error: error.message });
        return [];
    }
}

async function generateSandboxSales(pool, randomMerchants) {
    try {
        const testSales = [];
        const currencies = ['GBP', 'GBP', 'GBP', 'EUR', 'USD'];

        for (let i = 0; i < 12; i++) {
            const merchant = randomMerchants[Math.floor(Math.random() * randomMerchants.length)];
            const clubID = `TEST-${merchant.id || 'SANDBOX'}`;
            const saleAmount = (Math.random() * 180 + 20).toFixed(2);
            const commissionAmount = (saleAmount * (Math.random() * 0.18 + 0.04)).toFixed(2);
            const currency = currencies[Math.floor(Math.random() * currencies.length)];

            testSales.push({
                ClubID: clubID,
                AdvertiserName: merchant.company_name,
                SaleAmount: saleAmount,
                CommissionAmount: commissionAmount,
                Currency: currency
            });
        }

        for (const sale of testSales) {
            await pool.request()
                .input('ClubID', sql.NVarChar(50), sale.ClubID)
                .input('AdvertiserName', sql.NVarChar(255), sale.AdvertiserName)
                .input('SaleAmount', sql.Decimal(18,2), sale.SaleAmount)
                .input('CommissionAmount', sql.Decimal(18,4), sale.CommissionAmount)
                .input('Currency', sql.NVarChar(10), sale.Currency)
                .query(`
                    INSERT INTO dbo.AwinTransactions 
                        (AwinTransactionID, SellerID, ClubID, AdvertiserName, SaleAmount, CommissionAmount, Currency, TransactionDate, CommissionStatus)
                    VALUES 
                        (NEWID(), 'SANDBOX', @ClubID, @AdvertiserName, @SaleAmount, @CommissionAmount, @Currency, DATEADD(minute, -ABS(CHECKSUM(NEWID())) % 1440, GETDATE()), 'approved')
                `);
        }

        logger.info(`✅ Sandbox generated ${testSales.length} test sales for the last 24 hours`);
    } catch (error) {
        logger.error('Failed to generate sandbox sales', { error: error.message });
    }
}

async function getLast24hAwinSales(pool) {
    try {
        const result = await pool.request().query(`
            SELECT ClubID, AdvertiserName, SaleAmount, CommissionAmount, Currency
            FROM dbo.AwinTransactions
            WHERE TransactionDate >= DATEADD(hour, -24, GETDATE())
            ORDER BY TransactionDate DESC
        `);
        return result.recordset || [];
    } catch (error) {
        logger.error('Failed to get last 24h Awin sales', { error: error.message });
        return [];
    }
}

async function getAwinStats(pool) {
    try {
        const totalMerchantsResult = await pool.request().query(`
            SELECT COUNT(*) AS totalAwinMerchants FROM dbo.AwinHighApprovalMerchants WHERE Joined = 1
        `);
        const totalAwinMerchants = totalMerchantsResult.recordset[0].totalAwinMerchants || 0;

        const totalPartsResult = await pool.request().query(`
            SELECT COUNT(*) AS totalAwinParts FROM [madeiradb].[dbo].[MerchantProducts] WHERE Source = 'awin'
        `);
        const totalAwinParts = totalPartsResult.recordset[0].totalAwinParts || 0;

        const topMerchantsResult = await pool.request().query(`
            SELECT TOP 10
                ahm.MerchantId as id,
                ahm.Name as company_name,
                ahm.Website as website,
                ahm.logoUrl,
                ahm.primarySector,
                ahm.description,
                ISNULL((SELECT COUNT(*) FROM [madeiradb].[dbo].[MerchantProducts] mp WHERE mp.UserId = ahm.AwinUserId AND mp.Source = 'awin'), 0) AS merchant_parts_count
            FROM dbo.AwinHighApprovalMerchants ahm
            WHERE ahm.Joined = 1 AND ahm.AwinUserId IS NOT NULL
            ORDER BY merchant_parts_count DESC
        `);

        return {
            totalAwinMerchants,
            totalAwinParts,
            topMerchants: topMerchantsResult.recordset
        };
    } catch (error) {
        logger.error('Failed to get Awin stats', { error: error.message });
        return { totalAwinMerchants: 0, totalAwinParts: 0, topMerchants: [] };
    }
}

module.exports = { handler: exports.handler };