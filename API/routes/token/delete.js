// API/routes/token/delete.js
// Fully refactored to use SystemOTPs table (no placeholders)

const { logger, sql } = require('/opt/nodejs/helpers');
const { getUserById, normalizePhone, generatePin } = require('./helpers');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');
const crypto = require('crypto');

module.exports = async (event, { action = 'initiate', pool, sandbox = false }) => {
    const decoded = event.decoded;
    const body = event.body ? JSON.parse(event.body) : {};

    if (action === 'initiate') {
        const user = await getUserById(decoded.user_id, event, pool);
        if (!user) {
            return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
        }
        if (!user.phone_number) {
            return { statusCode: 400, body: { status: 'error', error_message: 'No phone number on file' } };
        }

        const normalizedPhone = normalizePhone(user.phone_number);
        if (!normalizedPhone) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid phone number' } };
        }

        // Cleanup any expired deletion OTPs for this user
        await pool.request()
            .input('user_id', sql.Char(8), decoded.user_id)
            .input('token_type', sql.VarChar(50), 'deletion')
            .query(`
                DELETE FROM SystemOTPs 
                WHERE user_id = @user_id 
                  AND token_type = @token_type 
                  AND expires_at < GETDATE()
            `);

        const otp = generatePin();
        const expires_at = new Date(Date.now() + 15 * 60 * 1000);

        const payload = JSON.stringify({
            email: user.email_address || null,
            phone: normalizedPhone
        });

        await pool.request()
            .input('user_id', sql.Char(8), decoded.user_id)
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'deletion')
            .input('expires_at', sql.DateTime, expires_at)
            .input('payload', sql.NVarChar(sql.MAX), payload)
            .query(`
                INSERT INTO SystemOTPs (user_id, otp, token_type, created_at, expires_at, payload)
                VALUES (@user_id, @otp, @token_type, GETDATE(), @expires_at, @payload)
            `);

        const smsMessage = `Your deletion OTP is ${otp}. It expires in 15 minutes.`;
        const smsSuccess = await sendSmsTextmagic(normalizedPhone, smsMessage);

        if (!smsSuccess) {
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to send OTP' } };
        }

        if (sandbox) logger.debug('[SANDBOX] Deletion OTP sent', { userId: decoded.user_id });

        return {
            statusCode: 200,
            body: { status: 'success', message: 'OTP sent successfully' }
        };

    } else if (action === 'confirm') {
        const { otp } = body;
        if (!otp) {
            return { statusCode: 400, body: { status: 'error', error_message: 'OTP is required' } };
        }

        const otpCheck = await pool.request()
            .input('user_id', sql.Char(8), decoded.user_id)
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'deletion')
            .query(`
                SELECT * FROM SystemOTPs 
                WHERE user_id = @user_id 
                  AND otp = @otp 
                  AND token_type = @token_type 
                  AND expires_at > GETDATE()
            `);

        if (otpCheck.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const deletionRecord = otpCheck.recordset[0];

        logger.info('Simulating user deletion', { userId: decoded.user_id });

        await pool.request()
            .input('otp_id', sql.Int, deletionRecord.otp_id)
            .query('DELETE FROM SystemOTPs WHERE otp_id = @otp_id');

        if (sandbox) logger.debug('[SANDBOX] Deletion confirmed', { userId: decoded.user_id });

        return {
            statusCode: 200,
            body: { status: 'success', message: 'User deletion simulated successfully' }
        };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
};