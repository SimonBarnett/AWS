// ====================== sqs/onboarding.js ======================
// Handles full async onboarding for communities
// Last updated: 29 June 2026

const { logger, enqueueMessage, executeWithRetry, sql } = require('/opt/nodejs/helpers');
const helpers = require('./helpers');   // ← Changed to avoid circular dependency

async function handle(event) {
    const { userId, url, partnerId, sandbox, pool } = event;

    if (!userId || !url || !partnerId || !pool) {
        logger.error('ONBOARDING called with missing required fields');
        return;
    }

    // Automatically extract the domain the user signed up from (caller domain)
    // Tries multiple common sources in order of reliability.
    // This is optional — we do not fail onboarding if we cannot determine it.
    let partnerUrl = null;

    if (event.origin) {
        partnerUrl = event.origin;
    } else if (event.referer) {
        partnerUrl = event.referer;
    } else if (event.headers?.origin) {
        partnerUrl = event.headers.origin;
    } else if (event.headers?.referer) {
        partnerUrl = event.headers.referer;
    }

    // Clean up to just the origin (domain + protocol) if a full URL was provided
    if (partnerUrl) {
        try {
            const urlObj = new URL(partnerUrl);
            partnerUrl = urlObj.origin;
        } catch (e) {
            // Keep the raw value if it's not a valid URL
        }
    }

    logger.info('Processing ONBOARDING', { userId, url, partnerId, partnerUrl });

    return helpers.withStatusHandling(event, async () => {

        const createRecord = async () => {
            await pool.request()
                .input('url', sql.NVarChar, url)
                .input('clubId', sql.VarChar, userId)
                .input('partnerId', sql.VarChar, partnerId)
                .input('partnerUrl', sql.NVarChar, partnerUrl)
                .input('status', sql.VarChar, 'queued')
                .query(`
                    MERGE INTO clubscan AS target
                    USING (SELECT @clubId AS ClubID, @url AS Url, @partnerId AS PartnerId, @partnerUrl AS PartnerURL) AS source
                    ON target.ClubID = source.ClubID
                    WHEN MATCHED THEN 
                        UPDATE SET 
                            Url = @url,
                            PartnerId = @partnerId,
                            PartnerURL = @partnerUrl,
                            Status = @status,
                            UpdatedAt = GETDATE()
                    WHEN NOT MATCHED THEN 
                        INSERT (Url, ClubID, PartnerId, PartnerURL, Status, CreatedAt, UpdatedAt)
                        VALUES (@url, @clubId, @partnerId, @partnerUrl, @status, GETDATE(), GETDATE());
                `);
        };

        await executeWithRetry(createRecord, { maxRetries: 3, logger });

        logger.info('clubscan record created/updated', { userId, url, partnerId, partnerUrl });

        if (sandbox) {
            logger.info('Sandbox mode - skipping CLUBSCAN_GENERATE_REVIEW', { url });
            return;
        }

        await enqueueMessage({
            type: 'CLUBSCAN_GENERATE_REVIEW',
            url
        });

        logger.info('✅ Enqueued CLUBSCAN_GENERATE_REVIEW from ONBOARDING', { url });

    }, {
        startStatus: 'onboarding',
        successStatus: 'onboarding_complete'
    });
}

module.exports = { handle };