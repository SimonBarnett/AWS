// API/routes/token/reset-password.js
// Fully refactored to use SystemOTPs table (no placeholders)

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

        // Rate limit + cleanup expired password reset tokens
        const threshold = new Date(Date.now() + 10 * 60 * 1000);

        await pool.request()
            .input('email', sql.VarChar(255), email.toLowerCase())
            .input('token_type', sql.VarChar(50), 'password_reset')
            .query(`
                DELETE FROM SystemOTPs 
                WHERE token_type = @token_type 
                  AND JSON_VALUE(payload, '$.email') = @email 
                  AND expires_at < GETDATE()
            `);

        const recent = await pool.request()
            .input('user_id', sql.Char(8), user.user_id)
            .input('threshold', sql.DateTime, threshold)
            .input('token_type', sql.VarChar(50), 'password_reset')
            .query(`
                SELECT TOP 1 1 FROM SystemOTPs 
                WHERE user_id = @user_id 
                  AND token_type = @token_type 
                  AND expires_at > @threshold
            `);

        if (recent.recordset.length > 0) {
            return { statusCode: 429, body: { status: 'error', error_message: 'Please wait before requesting a new OTP' } };
        }

        const otp = generatePin();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        const payload = JSON.stringify({
            email: email.toLowerCase()
        });

        await pool.request()
            .input('user_id', sql.Char(8), user.user_id)
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'password_reset')
            .input('expires_at', sql.DateTime, expiresAt)
            .input('payload', sql.NVarChar(sql.MAX), payload)
            .query(`
                INSERT INTO SystemOTPs (user_id, otp, token_type, created_at, expires_at, payload)
                VALUES (@user_id, @otp, @token_type, GETDATE(), @expires_at, @payload)
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
            body: { status: 'success', message: 'OTP sent' }
        };

    } else if (action === 'verify') {
        const { email, otp, new_password, confirm_new_password } = body;

        if (!email || !otp || !new_password || !confirm_new_password) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Missing required fields' } };
        }

        if (new_password !== confirm_new_password) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Passwords do not match' } };
        }

        const result = await pool.request()
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'password_reset')
            .input('email', sql.VarChar, email.toLowerCase())
            .query(`
                SELECT otp_id, user_id, expires_at, payload 
                FROM SystemOTPs 
                WHERE otp = @otp 
                  AND token_type = @token_type
            `);

        if (result.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const record = result.recordset[0];
        const recordPayload = JSON.parse(record.payload || '{}');

        if (recordPayload.email !== email.toLowerCase()) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

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
            .input('otp_id', sql.Int, record.otp_id)
            .query('DELETE FROM SystemOTPs WHERE otp_id = @otp_id');

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