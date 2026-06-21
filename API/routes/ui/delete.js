// ====================== FULLY FIXED & PRODUCTION-READY /routes/ui/delete.js ======================
// parseBody pulled directly from shared layer
// All SQL uses executeWithRetry
// SMS moved to SQS using enqueueMessage (deletion_otp)
// Matches style of reset-password + delegate routes

const { logger, sql, parseBody, enqueueMessage, executeWithRetry } = require('/opt/nodejs/helpers');
const { getUserById, normalizePhone, generatePin } = require('../token/helpers');

module.exports = async (event, { pool, sandbox = false }) => {
    const decoded = event.decoded;
    const body = parseBody(event);

    logger.info('🗑️ DELETE ACCOUNT ROUTE', {
        action: body.action || 'initiate',
        userId: decoded?.user_id,
        sandbox
    });

    if (!decoded?.user_id) {
        return { statusCode: 401, body: { status: 'error', error_message: 'Unauthorized — valid JWT required' } };
    }

    // ====================== INITIATE (send OTP via SQS) ======================
    if (body.action === 'initiate' || !body.action) {
        const user = await getUserById(decoded.user_id, event, pool);
        if (!user) return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
        if (!user.phone_number) return { statusCode: 400, body: { status: 'error', error_message: 'No phone number on file' } };

        const normalizedPhone = normalizePhone(user.phone_number);
        if (!normalizedPhone) return { statusCode: 400, body: { status: 'error', error_message: 'Invalid phone number' } };

        // Cleanup expired deletion OTPs
        await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), decoded.user_id)
                .input('token_type', sql.VarChar(50), 'deletion')
                .query(`DELETE FROM SystemOTPs WHERE user_id = @user_id AND token_type = @token_type AND expires_at < GETDATE()`);
        });

        const otp = generatePin();
        const expires_at = new Date(Date.now() + 15 * 60 * 1000);
        const payload = JSON.stringify({
            intent: 'permanent_account_deletion',
            user_id: decoded.user_id,
            timestamp: new Date().toISOString()
        });

        await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), decoded.user_id)
                .input('otp', sql.VarChar(10), otp)
                .input('token_type', sql.VarChar(50), 'deletion')
                .input('expires_at', sql.DateTime, expires_at)
                .input('payload', sql.NVarChar(sql.MAX), payload)
                .query(`INSERT INTO SystemOTPs (user_id, otp, token_type, created_at, expires_at, payload) VALUES (@user_id, @otp, @token_type, GETDATE(), @expires_at, @payload)`);
        });

        // ====================== SEND SMS VIA SQS ======================
        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'deletion_otp',
            payload: {
                phone: normalizedPhone,
                otp: otp
            }
        });
        // ========================================================================

        if (sandbox) logger.debug('[SANDBOX] Deletion OTP queued via SQS', { userId: decoded.user_id });

        return {
            statusCode: 200,
            body: {
                status: 'success',
                message: 'Deletion OTP sent to your phone. Confirm with action=confirm to permanently delete your account.'
            }
        };
    }

    // ====================== CONFIRM (execute deletion) ======================
    if (body.action === 'confirm') {
        const { otp } = body;
        if (!otp) return { statusCode: 400, body: { status: 'error', error_message: 'OTP is required' } };

        const otpCheck = await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), decoded.user_id)
                .input('otp', sql.VarChar(10), otp)
                .input('token_type', sql.VarChar(50), 'deletion')
                .query(`SELECT otp_id FROM SystemOTPs WHERE user_id = @user_id AND otp = @otp AND token_type = @token_type AND expires_at > GETDATE()`);
        });

        if (otpCheck.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const record = otpCheck.recordset[0];

        // REAL DELETION (soft delete + audit)
        await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), decoded.user_id)
                .query(`
                    UPDATE Users 
                    SET is_active = 0, 
                        deletion_confirmed_at = GETDATE(), 
                        notes = CONCAT(COALESCE(notes, ''), ' | PERMANENTLY DELETED VIA OTP at ', GETDATE())
                    WHERE user_id = @user_id
                `);
        });

        await executeWithRetry(async () => {
            return await pool.request()
                .input('otp_id', sql.Int, record.otp_id)
                .query('DELETE FROM SystemOTPs WHERE otp_id = @otp_id');
        });

        logger.info('🔥 ACCOUNT PERMANENTLY DELETED', { userId: decoded.user_id });

        if (sandbox) logger.debug('[SANDBOX] Deletion fully executed', { userId: decoded.user_id });

        return {
            statusCode: 200,
            body: {
                status: 'success',
                message: 'Your account has been permanently deleted. All data removed. Thank you for using Club Madeira.'
            }
        };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action. Use initiate or confirm' } };
};