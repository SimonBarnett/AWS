// routes/global.js
const { logger, getDbConnection, invokeMailer, sql } = require('/opt/nodejs/helpers');
const { callXaiApi } = require('/opt/nodejs/grok');   // ← Grok is in its own layer
const { MERCHANT_PERSONALISATION_SCHEMA } = require('../grok-schemas');

// ====================== ENVIRONMENT VARIABLES ======================
const GLOBAL_COOLDOWN_DAYS = parseInt(process.env.GLOBAL_COOLDOWN_DAYS) || 90;
const DEFAULT_MAX_RECOMMENDATIONS = parseInt(process.env.GLOBAL_MAX_RECOMMENDATIONS) || 20;
const DEFAULT_NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL_TO;

// ====================== GLOBAL MODE HANDLER ======================
exports.handler = async (event, { pool: passedPool } = {}) => {
    const maxRecs = parseInt(event.maxRecommendations) || DEFAULT_MAX_RECOMMENDATIONS;

    let notificationEmailTo = event.notificationEmailTo || DEFAULT_NOTIFICATION_EMAIL;
    if (typeof notificationEmailTo === 'string') {
        notificationEmailTo = notificationEmailTo.split(',').map(e => e.trim()).filter(Boolean);
    }

    if (!Array.isArray(notificationEmailTo) || notificationEmailTo.length === 0) {
        logger.error('notificationEmailTo is required');
        return { statusCode: 400, body: 'notificationEmailTo is required' };
    }

    logger.info('=== STARTING GLOBAL AWIN RECOMMENDATIONS ===', { 
        maxRecs, 
        notificationEmailTo 
    });

    let pool = passedPool;
    let shouldClosePool = false;

    try {
        if (!pool) {
            pool = await getDbConnection();
            shouldClosePool = true;
        }

        const candidatesResult = await pool.request().query(`
            SELECT TOP (${maxRecs}) 
                MerchantId as id,
                Name as name,
                logoUrl,
                ApprovalRate,
                description
            FROM dbo.AwinHighApprovalMerchants
            WHERE ProductFeed = 'Yes'
              AND Joined = 0
              AND TRY_CAST(REPLACE(ApprovalRate, '%', '') AS DECIMAL(5,2)) >= 99.00
              AND MerchantId NOT IN (
                  SELECT MerchantId 
                  FROM dbo.AwinRecommendedMerchants 
                  WHERE Mode = 'global' 
                    AND CreatedAt > DATEADD(DAY, -${GLOBAL_COOLDOWN_DAYS}, GETDATE())
              )
            ORDER BY LastSeen DESC
        `);

        let baseMerchants = candidatesResult.recordset || [];
        logger.info(`Global candidates found: ${baseMerchants.length}`);

        if (baseMerchants.length === 0) {
            logger.info('No candidates – quitting');
            return { statusCode: 200, body: JSON.stringify({ mode: 'global', recommendedCount: 0 }) };
        }

        const enriched = baseMerchants.map(m => ({
            id: m.id,
            name: m.name,
            logoUrl: m.logoUrl || '',
            approvalRate: m.ApprovalRate || 'n/a',
            description: m.description || ''
        }));

        let grokResult = [];
        try {
            logger.info('Calling Grok for personalisation');
            const grokPrompt = `You write short, engaging join requests (max 170 characters).

Club Madeira creates product catalogues for UK sports clubs, leisure groups, hobby societies and community organisations.

For each merchant write:
- whyItFits: one concise paragraph explaining why their products are a great fit for our sports/leisure/community clubs.
- joinRequestMessage: warm, professional message (max 170 characters) showing relevance to their sector.

Return ONLY valid JSON array.`;

            const messages = [
                { role: "system", content: "You are a helpful affiliate marketing assistant." },
                { role: "user", content: grokPrompt + "\n\nMerchants:\n" + JSON.stringify(enriched, null, 2) }
            ];

            grokResult = await callXaiApi(messages, MERCHANT_PERSONALISATION_SCHEMA) || [];
        } catch (grokErr) {
            logger.error('Grok failed – quitting', { error: grokErr.message });
            return { statusCode: 200, body: JSON.stringify({ mode: 'global', recommendedCount: 0 }) };
        }

        const recommended = enriched.map(m => {
            const grok = grokResult.find(g => g.merchantId === m.id) || {};
            return {
                id: m.id,
                name: m.name,
                logoUrl: m.logoUrl,
                approvalRate: m.approvalRate,
                description: m.description,
                whyItFits: grok.whyItFits || 'This range would be loved by our sports clubs, leisure groups and community organisations.',
                joinRequestMessage: grok.joinRequestMessage || `Dear ${m.name} team, your products are a perfect fit for UK sports clubs, leisure groups and community organisations. Our members would love your range and we would be delighted to partner with you.`,
                joinLink: `https://ui.awin.com/awin/affiliate/${process.env.AWIN_PUBLISHER_ID}/merchant-profile/${m.id}`
            };
        });

        // Record cooldown
        for (const rec of recommended) {
            await pool.request()
                .input('merchantId', sql.Int, rec.id)
                .input('name', sql.NVarChar, rec.name)
                .query(`INSERT INTO dbo.AwinRecommendedMerchants (MerchantId, Mode, Name, CreatedAt) VALUES (@merchantId, 'global', @name, GETDATE())`);
        }

        // ====================== EMAIL ======================
        let emailRows = '';
        recommended.forEach(rec => {
            const logoHtml = rec.logoUrl 
                ? `<img src="${rec.logoUrl}" alt="${rec.name}" style="max-height:60px;max-width:140px;">`
                : `<strong>${rec.name}</strong>`;

            const whyHtml = (rec.description ? rec.description + '<br><br>' : '') + rec.whyItFits;
            const joinHtml = rec.joinRequestMessage.replace(/\n/g, '<br>');

            emailRows += `
                <tr>
                    <td style="text-align:center;vertical-align:middle;">${logoHtml}</td>
                    <td style="font-size:14px;line-height:1.5;">${whyHtml}</td>
                    <td style="text-align:center;"><strong>${rec.approvalRate}</strong></td>
                    <td style="text-align:center;">
                        <a href="${rec.joinLink}" target="_blank" 
                           style="display:inline-block;padding:12px 32px;background:#00c853;color:white;
                                  text-decoration:none;border-radius:9999px;font-weight:bold;white-space:nowrap;
                                  box-shadow:0 4px 12px rgba(0,200,83,0.4);">
                            Join
                        </a>
                    </td>
                </tr>
                <tr>
                    <td colspan="4" style="background:#f9f9f9;padding:25px 20px;font-size:16px;line-height:1.5;">                        
                        ${joinHtml}
                    </td>
                </tr>`;
        });

        const emailHtml = `
            <h2>Daily AWIN Global Join Recommendations – ${recommended.length} merchants</h2>
            <p><strong>Club Madeira AI Platform</strong> — curating products for sports, leisure &amp; community groups across the UK.</p>
            
            <p><strong>Instructions:</strong> When requesting to join, please use this link: 
               <a href="https://clubmadeira.uk/for-awin-advertisers" target="_blank">https://clubmadeira.uk/for-awin-advertisers</a></p>

            <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr style="background:#f0f0f0;">
                        <th>Advertiser</th>
                        <th>Why it fits</th>
                        <th>Approval Rate</th>
                        <th>Join</th>
                    </tr>
                </thead>
                <tbody>${emailRows}</tbody>
            </table>
        `;

        await invokeMailer({
            from: 'support@clubmadeira.uk',
            to: notificationEmailTo,
            subject: `Daily AWIN Global Recommendations – ${recommended.length} merchants`,
            html: emailHtml
        });

        logger.info('✅ Global email sent successfully', { recommendedCount: recommended.length, to: notificationEmailTo });

        return { 
            statusCode: 200, 
            body: JSON.stringify({ mode: 'global', recommendedCount: recommended.length }) 
        };

    } catch (error) {
        logger.error('Global AWIN recommendations failed', { error: error.message, stack: error.stack });
        return { statusCode: 500, body: error.message };
    } finally {
        if (shouldClosePool && pool) {
            await pool.close().catch(() => {});
        }
    }
};