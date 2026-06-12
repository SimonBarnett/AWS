// API/routes/token/delete.js
// Consolidated Delete flow - actions: 'initiate' | 'confirm'

const { logger, sql } = require('/opt/nodejs/helpers');
const { getUserById, normalizePhone, generatePin } = require('./helpers');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');
const crypto = require('crypto');

module.exports = async (event, { action = 'initiate', pool, sandbox = false }) => {
    const decoded = event.decoded;
    const body = event.body ? JSON.parse(event.body) : {};

    if (action === 'initiate') {
        const user = await getUserById(decoded.user_id, event);
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

        const otp = generatePin();
        const otp_id = crypto.randomUUID();
        const expires_at = new Date(Date.now() + 15 * 60 * 1000);

        // Use passed pool - do not close
        await pool.request()
            .input('user_id', sql.VarChar(8), decoded.user_id)
            .query(`DELETE FROM deletion WHERE user_id = @user_id`);

        await pool.request()
            .input('otp_id', sql.VarChar(50), otp_id)
            .input('user_id', sql.VarChar(8), decoded.user_id)
            .input('otp', sql.VarChar(10), otp)
            .input('expires_at', sql.DateTime, expires_at)
            .query(`
                INSERT INTO deletion (otp_id, user_id, otp, expires_at)
                VALUES (@otp_id, @user_id, @otp, @expires_at)
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
            .input('user_id', sql.VarChar(8), decoded.user_id)
            .input('otp', sql.VarChar(10), otp)
            .query(`SELECT * FROM deletion WHERE user_id = @user_id AND otp = @otp AND expires_at > GETDATE()`);

        if (otpCheck.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        logger.info('Simulating user deletion', { userId: decoded.user_id });

        await pool.request()
            .input('user_id', sql.VarChar(8), decoded.user_id)
            .query(`DELETE FROM deletion WHERE user_id = @user_id`);

        if (sandbox) logger.debug('[SANDBOX] Deletion confirmed', { userId: decoded.user_id });

        return {
            statusCode: 200,
            body: { status: 'success', message: 'User deletion simulated successfully' }
        };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
};