// API/routes/token/delegate.js
// Fully refactored to use SystemOTPs table (no placeholders)

const { logger, sql, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT, verifyJWT } = require('/opt/nodejs/jwt');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');

const { 
    generatePin, 
    normalizePhone, 
    isValidPhone, 
    isValidEmail, 
    getUserById,
    setLastLogin,
    parseBody
} = require('./helpers');

const { hashPassword } = require('/opt/nodejs/helpers');

module.exports = async (event, { action = 'initiate', pool, sandbox = false }) => {
    const decoded = event.decoded;
    const body = parseBody(event);

    if (action === 'initiate') {
        const { first_name, phone_number, email_address } = body;

        if (!first_name || !phone_number || !email_address) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Missing required fields' } };
        }

        const normalizedPhone = normalizePhone(phone_number);
        if (!isValidPhone(normalizedPhone) || !isValidEmail(email_address)) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid phone or email format' } };
        }

        const user = await getUserById(decoded.user_id, event, pool);
        if (!user) {
            return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
        }

        const signup_url = event.headers.origin || 'https://greenfieldsites.clubmadeira.io';

        const userCheck = await pool.request()
            .input('email', sql.VarChar(255), email_address)
            .query(`SELECT COUNT(*) AS count FROM Users WHERE email_address = @email`);

        if (userCheck.recordset[0].count > 0) {
            return { statusCode: 409, body: { status: 'error', error_message: 'Email already in use' } };
        }

        // Cleanup expired delegation tokens for this email
        await pool.request()
            .input('email', sql.VarChar(255), email_address)
            .query(`
                DELETE FROM SystemOTPs 
                WHERE token_type = 'delegation' 
                  AND JSON_VALUE(payload, '$.email') = @email 
                  AND expires_at < GETDATE()
            `);

        const otp = generatePin();
        const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

        const delegationToken = await signJWT({ delegatorId: user.user_id, expiry: expiry.toISOString() });

        const payload = JSON.stringify({
            email: email_address,
            phone: normalizedPhone,
            first_name: first_name,
            signup_url: signup_url,
            communityUrl: user.communityUrl || ''
        });

        await pool.request()
            .input('user_id', sql.Char(8), decoded.user_id)
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'delegation')
            .input('expires_at', sql.DateTime, expiry)
            .input('payload', sql.NVarChar(sql.MAX), payload)
            .query(`
                INSERT INTO SystemOTPs (user_id, otp, token_type, created_at, expires_at, payload)
                VALUES (@user_id, @otp, @token_type, GETDATE(), @expires_at, @payload)
            `);

        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'delegation',
            payload: {
                email: email_address,
                token: delegationToken,
                phone: normalizedPhone,
                signup_url,
                url: user.communityUrl || ''
            }
        });

        const smsMessage = `Your delegation OTP is ${otp}. It expires in 48 hours.`;
        const smsSuccess = await sendSmsTextmagic(normalizedPhone, smsMessage);
        if (!smsSuccess) {
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to send OTP' } };
        }

        if (sandbox) logger.debug('[SANDBOX] Delegation initiated', { email: email_address });

        return {
            statusCode: 200,
            body: { status: 'success', message: 'Delegation initiated successfully' }
        };

    } else if (action === 'accept') {
        const { token, otp, newpassword } = body;

        if (!token || !otp || !newpassword) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Token, OTP and new password are required' } };
        }

        let decodedToken;
        try {
            decodedToken = await verifyJWT(token);
        } catch (err) {
            return { statusCode: 401, body: { status: 'error', error_message: 'Invalid token' } };
        }

        const user_id = decodedToken.delegatorId;
        const expiry = new Date(decodedToken.expiry);
        if (expiry < new Date()) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Token expired' } };
        }

        const delegationResult = await pool.request()
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'delegation')
            .query(`
                SELECT * FROM SystemOTPs 
                WHERE otp = @otp 
                  AND token_type = @token_type 
                  AND expires_at > GETDATE()
            `);

        if (delegationResult.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid delegation details' } };
        }

        const delegation = delegationResult.recordset[0];
        const delegationPayload = JSON.parse(delegation.payload || '{}');

        const hashedPassword = await hashPassword(newpassword);

        await pool.request()
            .input('first_name', sql.VarChar(50), delegationPayload.first_name)
            .input('email_address', sql.VarChar(255), delegationPayload.email)
            .input('phone_number', sql.VarChar(20), delegationPayload.phone)
            .input('password', sql.VarChar(255), hashedPassword)
            .input('user_id', sql.Char(8), user_id)
            .query(`UPDATE Users SET first_name = @first_name, email_address = @email_address, phone_number = @phone_number, password = @password WHERE user_id = @user_id`);

        await pool.request()
            .input('otp_id', sql.Int, delegation.otp_id)
            .query('DELETE FROM SystemOTPs WHERE otp_id = @otp_id');

        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'delegation_accepted',
            payload: {
                new_email: delegationPayload.email,
                old_email: ''
            }
        });

        const user = await getUserById(user_id, event, pool);

        const jwtToken = await signJWT({
            user_id: user.user_id,
            permissions: user.permissions,
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        });

        await setLastLogin(user.user_id, event.requestContext?.identity?.sourceIp, pool);

        if (sandbox) logger.debug('[SANDBOX] Delegation accepted', { userId: user_id });

        return {
            statusCode: 200,
            body: {
                status: 'success',
                token: jwtToken,
                user_id: user.user_id,
                contact_name: user.company_name || user.first_name || 'User',
                workflow: 'login'
            }
        };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
};