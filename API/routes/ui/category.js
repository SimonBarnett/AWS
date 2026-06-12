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
            await enqueueMessage({
                type: 'CATEGORY_UPDATE',
                userId,
                body,
                sandbox
            });

            if (sandbox) logger.debug('[SANDBOX] CATEGORY_UPDATE enqueued', { userId });

            return { status: 'success' };
        } catch (error) {
            logger.error('Failed to enqueue CATEGORY_UPDATE', { userId, error: error.message });
            return { status: 'error', error_message: 'Failed to process request', categories: {}, exclude: [], dialog: 'Error processing categories.' };
        }
    }

    // GET - Must wait for final 'complete' status
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

            // Any non-complete state = show spinner
            if (status !== 'complete') {
                return {
                    status: 'processing',
                    categories: {},
                    exclude: [],
                    dialog: 'We are still processing your community data. Please wait a moment.'
                };
            }

            // Only when status === 'complete' do we show the categories
            const userDataResult = await executeWithRetry(() =>
                pool.request()
                    .input('uid', sql.VarChar, userId)
                    .query(`
                        SELECT json_categories, json_chat, exclude 
                        FROM UserCategories 
                        WHERE uid = @uid
                    `)
            );

            const userData = userDataResult.recordset[0] || {};
            let categories = {};
            try { categories = JSON.parse(userData.json_categories || '{}'); } catch (e) {}

            return {
                status: 'success',
                categories,
                exclude: userData.exclude || [],
                dialog: userData.json_chat ? JSON.parse(userData.json_chat).slice(-1)[0]?.dialog || 'Here are your current categories.' : 'Here are your current categories.'
            };

        } catch (error) {
            logger.error('Error checking clubscan status', { userId, error: error.message });
            return { status: 'error', error_message: error.message, categories: {}, exclude: [], dialog: 'Error loading categories.' };
        }
    }
}

module.exports = handleCategory;