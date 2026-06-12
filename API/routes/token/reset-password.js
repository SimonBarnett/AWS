// API/routes/token/reset-password.js
// Consolidated Password Reset - actions: 'request' | 'verify'

const { logger, sql } = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');
const { hashPassword } = require('/opt/nodejs/helpers');

const {
    getUserByEmail,
    getUserById,
    updateUserPassword,
    getLastLogin,
    setLastLogin,
    generatePin
} = require('./helpers');

module.exports = async (event, { action = 'request', pool, sandbox = false }) => {
    const body = event.body ? JSON.parse(event.body) : {};

    if (action === 'request') {
        const { email } = body;
        if (!email) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Email required' } };
        }

        const user = await getUserByEmail(email);
        if (!user) {
            return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
        }

        // Rate limit using passed pool
        const threshold = new Date(Date.now() + 10 * 60 * 1000);
        const recent = await pool.request()
            .input('user_id', sql.VarChar, user.user_id)
            .input('threshold', sql.DateTime, threshold)
            .query(`SELECT TOP 1 1 FROM Otps WHERE user_id = @user_id AND expires_at > @threshold`);

        if (recent.recordset.length > 0) {
            return { statusCode: 429, body: { status: 'error', error_message: 'Please wait before requesting a new OTP' } };
        }

        const otp = generatePin();
        const otpToken = require('crypto').randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await pool.request()
            .input('otp_id', sql.VarChar, otpToken)
            .input('user_id', sql.VarChar, user.user_id)
            .input('otp', sql.VarChar, otp)
            .input('email', sql.VarChar, email.toLowerCase())
            .input('expires_at', sql.DateTime, expiresAt)
            .query(`
                INSERT INTO Otps (otp_id, user_id, otp, email, expires_at)
                VALUES (@otp_id, @user_id, @otp, @email, @expires_at)
            `);

        if (!user.phone_number) {
            return { statusCode: 400, body: { status: 'error', error_message: 'No phone number registered' } };
        }

        const message = `Your OTP for password reset is ${otp}. It expires in 15 minutes.`;
        const success = await sendSmsTextmagic(user.phone_number, message);

        if (!success) {
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to send OTP' } };
        }

        if (sandbox) logger.debug('[SANDBOX] Password reset OTP sent', { email });

        return {
            statusCode: 200,
            body: { status: 'success', message: 'OTP sent', otp_token: otpToken }
        };

    } else if (action === 'verify') {
        const { email, otp, new_password, confirm_new_password, otp_token } = body;

        if (!email || !otp || !new_password || !confirm_new_password || !otp_token) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Missing required fields' } };
        }

        if (new_password !== confirm_new_password) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Passwords do not match' } };
        }

        const result = await pool.request()
            .input('otp_id', sql.VarChar, otp_token)
            .input('otp', sql.VarChar, otp)
            .input('email', sql.VarChar, email.toLowerCase())
            .query(`SELECT user_id, expires_at FROM Otps WHERE otp_id = @otp_id AND otp = @otp AND email = @email`);

        if (result.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const record = result.recordset[0];
        if (new Date() > new Date(record.expires_at)) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const userId = record.user_id;
        const user = await getUserById(userId, event);
        if (!user) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid user' } };
        }

        const hashedPassword = await hashPassword(new_password);
        await updateUserPassword(userId, hashedPassword);

        await pool.request()
            .input('otp_id', sql.VarChar, otp_token)
            .query(`DELETE FROM Otps WHERE otp_id = @otp_id`);

        const token = await signJWT({
            user_id: user.user_id,
            permissions: user.permissions,
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        });

        await setLastLogin(user.user_id, event.requestContext?.identity?.sourceIp);

        const lastLogin = await getLastLogin(user.user_id);
        let lastLoginMessage;
        if (lastLogin) {
            lastLoginMessage = `You last logged in at ${new Date(lastLogin.timestamp).toLocaleString('en-GB')} from ${lastLogin.IP}.`;
        }

        if (sandbox) logger.debug('[SANDBOX] Password reset completed', { userId });

        return {
            statusCode: 200,
            body: {
                status: 'success',
                token,
                user_id: user.user_id,
                contact_name: user.company_name || user.first_name || 'User',
                workflow: 'login',
                ...(lastLoginMessage && { lastlogin: lastLoginMessage })
            }
        };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
};