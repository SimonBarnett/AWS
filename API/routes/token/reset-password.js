// ====================== SECURE RESET-PASSWORD BACKEND (FINAL) ======================
// Deploy this exact code to your Lambda

const { logger, sql, parseBody, enqueueMessage } = require('/opt/nodejs/helpers'); // ← Added enqueueMessage
const { signJWT } = require('/opt/nodejs/jwt');
const { hashPassword } = require('/opt/nodejs/helpers');

const {
    getUserByEmail,
    getUserById,
    getLastLogin,
    setLastLogin,
    generatePin,
    originCode
} = require('./helpers');

module.exports = async (event, { action = 'request', pool, sandbox = false }) => {
    const body = parseBody(event);
    const requestId = event.requestContext?.requestId || 'unknown';
    const ipAddress = event.requestContext?.identity?.sourceIp;

    const effectiveAction = body.action || action;
    logger.info('reset-password called', { effectiveAction, email: body.email, requestId });

    // ====================== REQUEST OTP ======================
    if (effectiveAction === 'request') {
        const { email } = body;
        if (!email) return { statusCode: 400, body: { status: 'error', error_message: 'Email required' } };

        const user = await getUserByEmail(email, event, pool);
        if (!user) return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
        if (!user.phone_number) return { statusCode: 400, body: { status: 'error', error_message: 'No phone number registered' } };

        // Cleanup old OTPs
        await pool.request()
            .input('email', sql.VarChar(255), email.toLowerCase())
            .input('token_type', sql.VarChar(50), 'password_reset')
            .query(`DELETE FROM SystemOTPs WHERE token_type = @token_type AND JSON_VALUE(payload, '$.email') = @email AND expires_at < GETDATE()`);

        // Rate limit check - ONLY for request action
        const threshold = new Date(Date.now() + 10 * 60 * 1000);
        const recent = await pool.request()
            .input('user_id', sql.Char(8), user.user_id)
            .input('threshold', sql.DateTime, threshold)
            .input('token_type', sql.VarChar(50), 'password_reset')
            .query(`SELECT TOP 1 1 FROM SystemOTPs WHERE user_id = @user_id AND token_type = @token_type AND expires_at > @threshold`);

        if (recent.recordset.length > 0) {
            return { statusCode: 429, body: { status: 'error', error_message: 'Please wait before requesting a new OTP' } };
        }

        const otp = generatePin();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const payload = JSON.stringify({ email: email.toLowerCase() });

        await pool.request()
            .input('user_id', sql.Char(8), user.user_id)
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'password_reset')
            .input('expires_at', sql.DateTime, expiresAt)
            .input('payload', sql.NVarChar(sql.MAX), payload)
            .query(`INSERT INTO SystemOTPs (user_id, otp, token_type, created_at, expires_at, payload) VALUES (@user_id, @otp, @token_type, GETDATE(), @expires_at, @payload)`);

        // ====================== ENQUEUE SMS VIA SQS ======================
        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'reset_password_otp',
            payload: {
                phone: user.phone_number,
                otp: otp
            }
        });

        logger.info('Password reset OTP enqueued', { userId: user.user_id, email });

        return { statusCode: 200, body: { status: 'success', message: 'OTP sent to your phone.' } };
    }

    // ====================== VERIFY ======================
    if (effectiveAction === 'verify') {
        const { email, otp, new_password, confirm_new_password } = body;

        if (!email || !otp || !new_password || !confirm_new_password) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Missing required fields' } };
        }
        if (new_password !== confirm_new_password) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Passwords do not match' } };
        }

        // Find OTP
        const result = await pool.request()
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'password_reset')
            .query(`SELECT otp_id, user_id, expires_at, payload FROM SystemOTPs WHERE otp = @otp AND token_type = @token_type`);

        if (result.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const record = result.recordset[0];

        if (new Date() > new Date(record.expires_at)) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const recordPayload = JSON.parse(record.payload || '{}');
        if (recordPayload.email !== email.toLowerCase()) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired OTP' } };
        }

        const userId = record.user_id;
        let user = await getUserById(userId, event, pool);
        if (!user) return { statusCode: 400, body: { status: 'error', error_message: 'Invalid user' } };

        // Update password
        const hashedPassword = await hashPassword(new_password);
        await pool.request()
            .input('user_id', sql.Char(8), userId)
            .input('password', sql.VarChar(255), hashedPassword)
            .query(`UPDATE Users SET password = @password, updated_at = GETDATE() WHERE user_id = @user_id`);

        // Delete used OTP
        await pool.request().input('otp_id', sql.Int, record.otp_id).query(`DELETE FROM SystemOTPs WHERE otp_id = @otp_id`);

        // Build permissions (same as login)
        let permissions = [...(user.permissions || [])];
        if (permissions.includes('partner')) {
            try {
                const affiliateCode = await originCode(event);
                if (user.user_id === affiliateCode && !permissions.includes('owner')) {
                    permissions.push('owner');
                }
            } catch (e) {}
        }

        // Create JWT
        const token = await signJWT({
            user_id: user.user_id,
            permissions,
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        });

        const contactName = user.company_name || user.first_name || 'User';
        const lastLoginRecord = await getLastLogin(user.user_id, pool);
        let lastLoginMessage = lastLoginRecord
            ? `You last logged in at ${new Date(lastLoginRecord.timestamp).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })} from ${lastLoginRecord.IP}.`
            : null;

        await setLastLogin(user.user_id, ipAddress, pool);

        const responseBody = {
            status: 'success',
            token,
            user_id: user.user_id,
            contact_name: contactName,
            workflow: 'login',
            roles: permissions
        };
        if (lastLoginMessage) responseBody.lastlogin = lastLoginMessage;

        logger.info('Password reset + login successful', { userId: user.user_id });

        return { statusCode: 200, body: responseBody };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
};