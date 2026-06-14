// routes/club.js
const { logger, sql } = require('/opt/nodejs/helpers');
const { callGrokStructured } = require('/opt/nodejs/grok');
const { 
    SECTOR_SCHEMA, 
    MERCHANT_PERSONALISATION_WITH_SCORE_SCHEMA 
} = require('../grok-schemas');

async function getClubData(clubId, pool) {
    logger.info('Fetching club data from clubscan', { clubId });
    const result = await pool.request()
        .input('clubId', sql.VarChar, clubId)
        .query(`SELECT Url, JsonResult FROM clubscan WHERE ClubID = @clubId`);

    const row = result.recordset[0];
    if (!row) throw new Error(`ClubID ${clubId} not found in clubscan`);

    let description = '';
    if (row.JsonResult) {
        try {
            const parsed = JSON.parse(row.JsonResult);
            description = parsed.review || parsed.description || JSON.stringify(parsed).slice(0, 2000);
        } catch (e) {
            description = row.JsonResult.substring(0, 2000);
        }
    }

    logger.info('Club data loaded successfully', {
        descriptionLength: description.length,
        hasDescription: description.length > 0,
        url: row.Url
    });

    return {
        url: row.Url || 'https://clubmadeira.uk',
        description: description.trim() || 'No description available'
    };
}

exports.handler = async (event, { pool } = {}) => {
    if (!pool) {
        throw new Error('Pool must be passed from the orchestrator');
    }

    const clubId = event.clubId;
    const partnerId = event.partnerId || event.PartnerID || event.partnerID || null;
    const minRelevanceScore = parseFloat(event.minRelevanceScore) || parseFloat(process.env.MIN_RELEVANCE_SCORE) || 0.5;

    let notificationEmailTo = event.notificationEmailTo || process.env.NOTIFICATION_EMAIL_TO;
    if (typeof notificationEmailTo === 'string') {
        notificationEmailTo = notificationEmailTo.split(',').map(e => e.trim()).filter(Boolean);
    }
    if (!Array.isArray(notificationEmailTo) || notificationEmailTo.length === 0) {
        logger.error('No notificationEmailTo provided');
        return { statusCode: 400, body: 'notificationEmailTo is required' };
    }

    logger.info('=== STARTING CLUB MODE ===', { 
        clubId, 
        partnerId,
        minRelevanceScore, 
        notificationEmailTo 
    });

    try {
        const clubData = await getClubData(clubId, pool);

        // Get real sectors from high-approval merchants
        const availableSectorsResult = await pool.request().query(`
            SELECT DISTINCT primarySector 
            FROM dbo.AwinHighApprovalMerchants 
            WHERE primarySector IS NOT NULL AND primarySector != ''
            ORDER BY primarySector
        `);
        const availableSectors = availableSectorsResult.recordset.map(r => r.primarySector);

        logger.info('Calling Grok for relevant sectors');
        const sectorPrompt = `Return ONLY a valid JSON array of strings. No explanation.

Club description: ${clubData.description}

You MUST choose sectors ONLY from this exact list:
${availableSectors.join(', ')}

Example: ["Sports Equipment", "Sportswear", "Clothing"]`;

        const sectorMessages = [
            { role: "system", content: "Always respond with valid JSON only." },
            { role: "user", content: sectorPrompt }
        ];

        let relevantSectors = await callGrokStructured(sectorMessages, SECTOR_SCHEMA) || [];
        logger.info('Relevant sectors selected by Grok', { count: relevantSectors.length, sectors: relevantSectors });

        if (relevantSectors.length === 0) {
            logger.warn('No relevant sectors returned – quitting');
            return { statusCode: 200, body: JSON.stringify({ mode: 'club', recommendedCount: 0 }) };
        }

        // Fetch candidates
        const sectorList = relevantSectors.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const merchantQuery = `
            SELECT 
                MerchantId as id,
                Name as name,
                primarySector,
                description,
                logoUrl,
                ApprovalRate
            FROM dbo.AwinHighApprovalMerchants
            WHERE ProductFeed = 'Yes'
              AND Joined = 0
              AND (
                primarySector IN (${sectorList})
                OR ${relevantSectors.map(s => `primarySector LIKE '%${s.replace(/'/g, "''")}%'`).join(' OR ')}
              )
            ORDER BY MerchantId
        `;

        const result = await pool.request().query(merchantQuery);
        let candidates = result.recordset || [];

        logger.info('Candidates after filter', { count: candidates.length });

        if (candidates.length === 0) {
            logger.info('No merchants passed filter – quitting');
            return { statusCode: 200, body: JSON.stringify({ mode: 'club', recommendedCount: 0 }) };
        }

        // ====================== GROK RELEVANCE SCORING IN BATCHES ======================
        const batchSize = 80;
        let allPersonalised = [];

        for (let i = 0; i < candidates.length; i += batchSize) {
            const batch = candidates.slice(i, i + batchSize);
            logger.info(`Processing relevance batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(candidates.length / batchSize)}`);

            const batchPrompt = `You are the official coordinator writing on behalf of our UK community club.

Club description: ${clubData.description}

For each merchant, return a valid JSON array containing objects with:
- merchantId
- merchantName
- whyItFits (1-2 short sentences explaining the strong relevance to our club and members)
- joinRequestMessage (warm, engaging, personal message FROM OUR CLUB – MAXIMUM 200 characters)
- relevanceScore (0.0 to 1.0)

CRITICAL RULES for joinRequestMessage:
- Write from the club’s perspective using "we", "our club", "our members"
- Clearly identify who we are and why we are a good partner for them
- Show direct relevance to their products/services
- Be friendly, enthusiastic, and professional
- Never use individual personal names
- Keep it natural and concise (under 200 characters)

Merchants:
${batch.map(m => `${m.id}|${m.name}|${m.primarySector || ''}|${(m.description || '').substring(0, 180)}`).join('\n')}
`;

            const messages = [
                { role: "system", content: "You are writing officially on behalf of the club. Always respond with a valid JSON array only. Never add explanations or extra text." },
                { role: "user", content: batchPrompt }
            ];

            const batchResult = await callGrokStructured(messages, MERCHANT_PERSONALISATION_WITH_SCORE_SCHEMA) || [];
            allPersonalised = allPersonalised.concat(batchResult);
        }

        const recommendedRaw = allPersonalised.filter(r => (r.relevanceScore || 0) >= minRelevanceScore);

        const candidateMap = new Map(candidates.map(c => [c.id, c]));
        const recommended = recommendedRaw.map(r => {
            const orig = candidateMap.get(r.merchantId) || {};
            return {
                ...r,
                logoUrl: orig.logoUrl || '',
                approvalRate: orig.ApprovalRate || 'n/a',
                description: orig.description || ''
            };
        });

        logger.info('Final recommendations after relevance threshold', { count: recommended.length });

        if (recommended.length === 0) {
            logger.info('No merchants passed relevance threshold – quitting');
            return { statusCode: 200, body: JSON.stringify({ mode: 'club', recommendedCount: 0 }) };
        }

        // Record recommendations
        await pool.request().query(`
            MERGE dbo.AwinRecommendedMerchants AS target
            USING (VALUES ${recommended.map(r => `(${r.merchantId}, 'club', GETDATE())`).join(',')}) 
                AS source (MerchantId, Mode, SentAt)
            ON target.MerchantId = source.MerchantId AND target.Mode = source.Mode
            WHEN MATCHED THEN UPDATE SET SentAt = source.SentAt
            WHEN NOT MATCHED THEN INSERT (MerchantId, Mode, SentAt) 
                VALUES (source.MerchantId, source.Mode, source.SentAt);
        `);

        // ====================== UPDATE PARTNERID IF PROVIDED ======================
        if (partnerId) {
            const merchantIdsList = recommended.map(r => r.merchantId).join(',');
            if (merchantIdsList) {
                await pool.request()
                    .input('partnerId', sql.NVarChar(100), partnerId)
                    .query(`
                        UPDATE dbo.AwinHighApprovalMerchants
                        SET PartnerID = @partnerId
                        WHERE MerchantId IN (${merchantIdsList})
                    `);
                logger.info(`Updated PartnerID = ${partnerId} for ${recommended.length} recommended merchants`);
            }
        }

        // ====================== EMAIL (ALWAYS SENT) ======================
        let emailRows = '';
        recommended.forEach(rec => {
            const logoHtml = rec.logoUrl 
                ? `<img src="${rec.logoUrl}" alt="${rec.merchantName}" style="max-height:60px;max-width:140px;">`
                : `<strong>${rec.merchantName}</strong>`;

            const whyHtml = (rec.description ? rec.description + '<br><br>' : '') + rec.whyItFits;
            const joinHtml = rec.joinRequestMessage.replace(/\n/g, '<br>');

            emailRows += `
                <tr>
                    <td style="text-align:center;vertical-align:middle;">${logoHtml}</td>
                    <td style="font-size:14px;line-height:1.5;">${whyHtml}</td>
                    <td style="text-align:center;"><strong>${rec.approvalRate}</strong></td>
                    <td style="text-align:center;">
                        <a href="https://ui.awin.com/awin/affiliate/2889699/merchant-profile/${rec.merchantId}" 
                           target="_blank" style="display:inline-block;padding:12px 32px;background:#00c853;color:white;
                           text-decoration:none;border-radius:9999px;font-weight:bold;white-space:nowrap;
                           box-shadow:0 4px 12px rgba(0,200,83,0.4);">Join</a>
                    </td>
                </tr>
                <tr>
                    <td colspan="4" style="background:#f9f9f9;padding:25px 20px;font-size:16px;line-height:1.5;">
                        ${joinHtml}
                    </td>
                </tr>`;
        });

        const emailHtml = `
            <h2>AWIN Join Recommendations – Club ${clubId}</h2>
            <p><strong>Website:</strong> <a href="${clubData.url}">${clubData.url}</a></p>
            <p><strong>Description:</strong><br>${clubData.description}</p>
            <p><strong>Instructions:</strong> Create promotional space for ${clubData.url} first, then click Join links below and copy/paste the join message.</p>
            <hr>
            <h3>Recommended AWIN Advertisers (${recommended.length})</h3>
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
            <hr>            
        `;

        await sendMail({
            from: 'support@clubmadeira.uk',
            to: notificationEmailTo,
            subject: `AWIN Join Recommendations – Club ${clubId}`,
            html: emailHtml
        });

        logger.info('Club recommendations email sent successfully', { recommendedCount: recommended.length });

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                mode: 'club', 
                recommendedCount: recommended.length,
                partnerIdUpdated: !!partnerId 
            }) 
        };

    } catch (error) {
        logger.error('Club mode failed', { error: error.message, stack: error.stack });
        return { statusCode: 500, body: error.message };
    }
    // NOTE: Pool is managed by the orchestrator (index.js). Do not close here.
};