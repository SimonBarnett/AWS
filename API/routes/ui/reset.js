// ====================== routes/ui/reset.js ======================
const { logger, sql, executeWithRetry } = require('/opt/nodejs/helpers');

// Route handler for /category/reset
async function handleReset(userId, { pool, sandbox = false } = {}) {
    try {
        await executeWithRetry(() =>
            pool.request()
                .input('uid', sql.VarChar, userId)
                .query(`DELETE FROM UserCategories WHERE uid = @uid;`)
        );

        if (sandbox) logger.debug('[SANDBOX] Reset user categories', { userId });

        logger.info('Reset user categories', { userId });

        return {
            status: 'success',
            error_message: null,
            categories: {},
            exclude: [],
            dialog: 'Categories reset successfully. Let’s start fresh!'
        };
    } catch (error) {
        logger.error('Failed to reset categories', { userId, error: error.message });
        return {
            status: 'error',
            error_message: 'Failed to reset categories',
            categories: {},
            exclude: [],
            dialog: ''
        };
    }
}

module.exports = handleReset;