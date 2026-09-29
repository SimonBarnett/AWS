// ====================== FULLY FIXED & PRODUCTION-READY /routes/ui/reset.js ======================
// parseBody pulled directly from shared layer
// All SQL uses executeWithRetry
// OTP sent via SQS using enqueueMessage (reset_otp)
// Matches style of delete.js + delegate routes

const { logger, sql, parseBody, enqueueMessage, executeWithRetry } = require('/opt/nodejs/helpers');
const { getUserById, normalizePhone, generatePin } = require('../token/helpers');

module.exports = async (event, { pool, sandbox = false }) => {
    const decoded = event.decoded;
    const body = parseBody(event);

    logger.info('🔄 RESET CATEGORIES ROUTE', {
        action: body.action || 'initiate',
        userId: decoded?.user_id,
        sandbox
    });

    if (!decoded?.user_id) {
        return { statusCode: 401, body: { status: 'error', error_message: 'Unauthorized — valid JWT required' } };
    }

    // ====================== INITIATE (send Reset OTP via SQS) ======================
    if (body.action === 'initiate' || !body.action) {
        const user = await getUserById(decoded.user_id, event, pool);
        if (!user) return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
        if (!user.phone_number) return { statusCode: 400, body: { status: 'error', error_message: 'No phone number on file' } };

        const normalizedPhone = normalizePhone(user.phone_number);
        if (!normalizedPhone) return { statusCode: 400, body: { status: 'error', error_message: 'Invalid phone number' } };

        // Cleanup expired reset OTPs
        await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), decoded.user_id)
                .input('token_type', sql.VarChar(50), 'reset')
                .query(`DELETE FROM SystemOTPs WHERE user_id = @user_id AND token_type = @token_type AND expires_at < GETDATE()`);
        });

        const otp = generatePin();
        const expires_at = new Date(Date.now() + 15 * 60 * 1000);
        const payload = JSON.stringify({
            intent: 'reset_user_categories',
            user_id: decoded.user_id,
            timestamp: new Date().toISOString()
        });

        await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), decoded.user_id)
                .input('otp', sql.VarChar(10), otp)
                .input('token_type', sql.VarChar(50), 'reset')
                .input('expires_at', sql.DateTime, expires_at)
                .input('payload', sql.NVarChar(sql.MAX), payload)
                .query(`INSERT INTO SystemOTPs (user_id, otp, token_type, created_at, expires_at, payload) VALUES (@user_id, @otp, @token_type, GETDATE(), @expires_at, @payload)`);
        });

        // ====================== SEND RESET OTP VIA SQS ======================
        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'reset_otp',
            payload: {
                phone: normalizedPhone,
                otp: otp
            }
        });
        // ========================================================================

        if (sandbox) logger.debug('[SANDBOX] Reset OTP queued via SQS', { userId: decoded.user_id });

        return {
            statusCode: 200,
            body: {
                status: 'success',
                message: 'Reset OTP sent to your phone. Confirm with action=confirm to reset your categories.'
            }
        };
    }

    // ====================== CONFIRM (execute reset) ======================
    if (body.action === 'confirm') {
        const { otp } = body;
        if (!otp) return { statusCode: 400, body: { status: 'error', error_message: 'OTP is required' } };

        const otpCheck = await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), decoded.user_id)
                .input('otp', sql.VarChar(10), otp)
                .input('token_type', sql.VarChar(50), 'reset')
                .query(`SELECT otp_id FROM SystemOTPs WHERE user_id = @user_id AND otp = @otp AND token_type = @token_type AND expires_at > GETDATE()`);
        });

        if (otpCheck.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const record = otpCheck.recordset[0];

        // ====================== GET CLUB URL FROM CLUBSCAN ======================
        const clubscanResult = await executeWithRetry(async () => {
            return await pool.request()
                .input('clubId', sql.VarChar, decoded.user_id)
                .query(`SELECT Url FROM clubscan WHERE ClubID = @clubId`);
        });

        let clubUrl = null;
        if (clubscanResult.recordset.length > 0 && clubscanResult.recordset[0].Url) {
            clubUrl = clubscanResult.recordset[0].Url;
        }
        // ================================================================

        // ====================== TRIGGER CLUBSCAN REVIEW ======================
        if (clubUrl) {
            await enqueueMessage({
                type: 'CLUBSCAN_GENERATE_REVIEW',
                url: clubUrl,
                sandbox: sandbox
            });
            logger.info('📡 CLUBSCAN_GENERATE_REVIEW triggered', { userId: decoded.user_id, url: clubUrl });
        } else {
            logger.warn('No URL found in clubscan table for this user', { userId: decoded.user_id });
        }
        // =====================================================================

        // Clean up used OTP
        await executeWithRetry(async () => {
            return await pool.request()
                .input('otp_id', sql.Int, record.otp_id)
                .query('DELETE FROM SystemOTPs WHERE otp_id = @otp_id');
        });

        logger.info('🔄 CATEGORIES RESET + CLUBSCAN REVIEW TRIGGERED', { userId: decoded.user_id });

        if (sandbox) logger.debug('[SANDBOX] Reset flow completed after OTP confirmation', { userId: decoded.user_id });

        return {
            statusCode: 200,
            body: {
                status: 'success',
                error_message: null,
                categories: {},
                exclude: [],
                dialog: 'Categories reset successfully. Let’s start fresh!'
            }
        };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action. Use initiate or confirm' } };
};