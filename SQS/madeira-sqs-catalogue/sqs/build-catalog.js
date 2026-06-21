// ====================== sqs/clubscan/build-catalog.js ======================
// Builds Catalog table from UserCategories.json_categories
// Saves SearchTerms + RelevantKeywords + IrrelevantKeywords + Notes
// If last chat entry has dialog but no audio → generates base64 audio and saves it
// Cleans up old/stale categories (including those with NULL ProcessedBatchId)
// Triggers CLUBSCAN_NOTIFY during onboarding (when enqueueNotify === true)
// Automatically records errors in LastError on failure
// Includes JSON validation before saving json_chat to prevent broken JSON
// Last updated: 21 June 2026

const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

const {
    logger,
    enqueueMessage,
    sql
} = require('/opt/nodejs/helpers');

const { withStatusHandling } = require('./helpers');

// ====================== OPENAI TTS HELPER ======================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function generateDialogAudio(dialogText) {
    if (!dialogText || typeof dialogText !== 'string') return null;

    try {
        const response = await openai.audio.speech.create({
            model: "tts-1",
            voice: "fable",                    // Change to "onyx" for deeper male voice
            input: dialogText
        });

        const audioBuffer = Buffer.from(await response.arrayBuffer());
        const base64Audio = audioBuffer.toString('base64');

        logger.info('✅ Generated base64 audio for dialog', {
            dialogLength: dialogText.length,
            audioBase64Length: base64Audio.length
        });

        return base64Audio;
    } catch (err) {
        logger.error('Failed to generate audio for dialog', { error: err.message });
        return null;
    }
}

// ====================== MAIN HANDLER ======================
async function handle(event) {
    const { sandbox, enqueueNotify } = event;

    return withStatusHandling(event, async ({ pool, url }) => {

        // Get ClubID
        const clubResult = await pool.request()
            .input('url', sql.NVarChar, url)
            .query('SELECT ClubID FROM clubscan WHERE Url = @url');

        const row = clubResult.recordset[0];
        if (!row) {
            throw new Error('Club record not found in clubscan');
        }

        const userId = row.ClubID;

        // Read both json_categories and json_chat
        const catResult = await pool.request()
            .input('uid', sql.VarChar, userId)
            .query(`
                SELECT TOP 1 json_categories, json_chat 
                FROM UserCategories 
                WHERE uid = @uid 
                ORDER BY LastUpdate DESC
            `);

        const jsonCategories = catResult.recordset[0]?.json_categories;
        const jsonChat       = catResult.recordset[0]?.json_chat;

        if (!jsonCategories) {
            throw new Error('No categories found in UserCategories');
        }

        let categories;
        try {
            categories = JSON.parse(jsonCategories);
        } catch (e) {
            throw new Error(`Failed to parse json_categories: ${e.message}`);
        }

        // Parse chat history
        let chat = [];
        if (jsonChat) {
            try {
                chat = JSON.parse(jsonChat);
            } catch (e) {
                chat = [];
            }
        }
        if (!Array.isArray(chat)) chat = [];

        logger.info('Starting catalog build from UserCategories', {
            url,
            userId,
            categoryCount: Object.keys(categories).length,
            chatLength: chat.length
        });

        // ====================== CHECK FOR MISSING AUDIO ======================
        let audioWasGenerated = false;

        if (chat.length > 0) {
            const lastEntry = chat[chat.length - 1];

            if (lastEntry && lastEntry.dialog && !lastEntry.audio) {
                logger.info('Last chat entry has dialog but no audio. Generating...');

                const base64Audio = await generateDialogAudio(lastEntry.dialog);

                if (base64Audio) {
                    lastEntry.audio = base64Audio;
                    audioWasGenerated = true;
                    logger.info('✅ Audio added to last chat entry', {
                        audioLength: base64Audio.length
                    });
                }
            }
        }

        // ====================== BUILD CATALOG ======================
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

            // ====================== SAVE UPDATED JSON_CHAT (with validation) ======================
            if (audioWasGenerated && chat.length > 0) {
                const jsonToSave = JSON.stringify(chat);

                // Validate JSON before saving to prevent broken JSON in database
                try {
                    JSON.parse(jsonToSave);
                } catch (validationError) {
                    logger.error('Generated json_chat is invalid JSON. Aborting save.', {
                        error: validationError.message
                    });
                    throw new Error('Invalid JSON would have been written to json_chat');
                }

                await pool.request()
                    .input('uid', sql.VarChar, userId)
                    .input('json_chat', sql.NVarChar(sql.MAX), jsonToSave)
                    .query(`
                        UPDATE UserCategories 
                        SET json_chat = @json_chat,
                            LastUpdate = GETDATE()
                        WHERE uid = @uid
                    `);

                logger.info('✅ Updated json_chat with audio property', {
                    userId,
                    jsonLength: jsonToSave.length
                });
            }

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
                    await enqueueMessage({
                        type: 'CLUBSCAN_NOTIFY',
                        url
                    });
                    logger.info('✅ Catalog build complete (onboarding). Triggered CLUBSCAN_NOTIFY', { url });
                } else {
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
        successStatus: enqueueNotify === true ? 'catalog_complete' : 'completed'
    });
}

module.exports = { handle };