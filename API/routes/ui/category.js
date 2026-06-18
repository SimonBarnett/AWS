// ====================== routes/ui/category.js ======================
// Category route handler
// clubscan.Status is the single source of truth.
// MUST show spinner until final status = 'complete'.
// *_complete only means that step finished — not the whole process.

const { logger, executeWithRetry, sql, enqueueMessage } = require('/opt/nodejs/helpers');

async function handleCategory(userId, body, method, { pool, sandbox = false } = {}) {
    logger.info('Handling category request', { userId, method });

    if (!userId) {
        return { status: 'error', error_message: 'Invalid user', categories: {}, exclude: [], dialog: 'Error' };
    }

    if (method === 'POST') {
        try {

            // =====================================================
            // 1. Fetch current chat and exclude from database
            // =====================================================
            const currentResult = await executeWithRetry(() =>
                pool.request()
                    .input('uid', sql.VarChar, userId)
                    .query(`
                        SELECT json_categories, json_chat, json_exclude 
                        FROM UserCategories 
                        WHERE uid = @uid
                    `)
            );

            let currentCategories = {};
            let currentChat = [];
            let currentExclude = [];

            if (currentResult.recordset[0]) {
                try {
                    currentCategories = JSON.parse(currentResult.recordset[0].json_categories || '{}');
                } catch (e) {
                    currentCategories = {};
                }
                try {
                    currentChat = JSON.parse(currentResult.recordset[0].json_chat || '[]');
                } catch (e) {
                    currentChat = [];
                }
                try {
                    currentExclude = JSON.parse(currentResult.recordset[0].json_exclude || '[]');
                } catch (e) {
                    currentExclude = [];
                }
            }

            // =====================================================
            // 2. Add new entry to json_chat
            // =====================================================            
            let newChatEntry;

            if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim() === '') {
                newChatEntry = {
                    dialog: "Empty prompt."
                };
            } else {
                newChatEntry = {
                    prompt: body.prompt.trim()
                    // dialog will be added later by the SQS consumer after Grok responds
                };
            }

            currentChat.push(newChatEntry);

            // =====================================================
            // 3. Merge new exclusions into json_exclude
            // =====================================================
            if (Array.isArray(body.exclude) && body.exclude.length > 0) {
                const newExcludes = body.exclude.map(item => item.toLowerCase().trim());
                const existingExcludes = currentExclude.map(item => item.toLowerCase().trim());
                currentExclude = [...new Set([...existingExcludes, ...newExcludes])];
            }

            // =====================================================
            // 4. Save updated json_chat and json_exclude
            //    Fixed: Removed invalid 'created_at' column
            // =====================================================
            await executeWithRetry(() =>
                pool.request()
                    .input('uid', sql.VarChar, userId)
                    .input('json_chat', sql.NVarChar(sql.MAX), JSON.stringify(currentChat))
                    .input('json_exclude', sql.NVarChar(sql.MAX), JSON.stringify(currentExclude))
                    .query(`
                        MERGE INTO UserCategories AS target
                        USING (SELECT @uid AS uid) AS source
                        ON target.uid = source.uid
                        WHEN MATCHED THEN
                            UPDATE SET 
                                json_chat = @json_chat,
                                json_exclude = @json_exclude,
                                LastUpdate = GETDATE()
                        WHEN NOT MATCHED THEN
                            INSERT (uid, json_chat, json_exclude, LastUpdate)
                            VALUES (@uid, @json_chat, @json_exclude, GETDATE());
                    `)
            );

            // =====================================================
            // 5. Enqueue lightweight message to SQS (only if we got a real prompt)
            // =====================================================
            if (newChatEntry.prompt) {
                await enqueueMessage({
                    type: 'CATEGORY_UPDATE',
                    userId,
                    sandbox
                });
            }

            return { status: 'success' };

        } catch (error) {
            logger.error('Failed to process CATEGORY_UPDATE in API', { userId, error: error.message });
            return {
                status: 'error',
                error_message: 'Failed to process request',
                categories: {},
                exclude: [],
                dialog: 'Error processing categories.'
            };
        }
    }

    // GET remains unchanged
    if (method === 'GET') {
        try {
            const clubscanResult = await executeWithRetry(() =>
                pool.request()
                    .input('clubId', sql.VarChar, userId)
                    .query(`
                        SELECT TOP 1 Status 
                        FROM clubscan 
                        WHERE ClubID = @clubId 
                        ORDER BY UpdatedAt DESC
                    `)
            );

            const status = (clubscanResult.recordset[0]?.Status || 'not_started').toLowerCase();

            if (status !== 'completed') {
                return {
                    status: 'processing',
                    categories: {},
                    exclude: [],
                    dialog: 'We are still processing your community data. Please wait a moment.'
                };
            }

            const userDataResult = await executeWithRetry(() =>
                pool.request()
                    .input('uid', sql.VarChar, userId)
                    .query(`
                        SELECT json_categories, json_chat, json_exclude 
                        FROM UserCategories 
                        WHERE uid = @uid
                    `)
            );

            const userData = userDataResult.recordset[0] || {};
            let categories = {};
            try { categories = JSON.parse(userData.json_categories || '{}'); } catch (e) {}

            let dialog = 'Here are your current categories.';
            try {
                const chat = JSON.parse(userData.json_chat || '[]');
                if (chat.length > 0) {
                    dialog = chat[chat.length - 1]?.dialog || dialog;
                }
            } catch (e) {}

            return {
                status: 'success',
                categories,
                exclude: userData.json_exclude || [],
                dialog
            };

        } catch (error) {
            logger.error('Error checking clubscan status', { userId, error: error.message });
            return {
                status: 'error',
                error_message: error.message,
                categories: {},
                exclude: [],
                dialog: 'Error loading categories.'
            };
        }
    }
}

module.exports = handleCategory;