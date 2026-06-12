// API/routes/token/delegate.js
// Consolidated Delegation flow - actions: 'initiate' | 'accept'

// Emails kept (were already being sent before). Now using enqueue instead of direct calls.

const { logger, sql, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT, verifyJWT } = require('/opt/nodejs/jwt');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');

const { 
    generatePin, 
    normalizePhone, 
    isValidPhone, 
    isValidEmail, 
    getUserById,
    setLastLogin
} = require('./helpers');

const { hashPassword } = require('/opt/nodejs/helpers');

module.exports = async (event, { action = 'initiate', pool, sandbox = false }) => {
    const decoded = event.decoded;
    const body = event.body ? JSON.parse(event.body) : {};

    if (action === 'initiate') {
        const { first_name, phone_number, email_address } = body;

        if (!first_name || !phone_number || !email_address) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Missing required fields' } };
        }

        const normalizedPhone = normalizePhone(phone_number);
        if (!isValidPhone(normalizedPhone) || !isValidEmail(email_address)) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid phone or email format' } };
        }

        const user = await getUserById(decoded.user_id, event);
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

        await pool.request().query(`DELETE FROM delegation WHERE created_at < DATEADD(HOUR, -48, GETDATE())`);

        const delegationCheck = await pool.request()
            .input('email', sql.VarChar(255), email_address)
            .query(`SELECT user_id FROM delegation WHERE email_address = @email`);

        if (delegationCheck.recordset.length > 0) {
            return { statusCode: 409, body: { status: 'error', error_message: 'Pending delegation exists' } };
        }

        const otp = generatePin();
        const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        const delegationToken = await signJWT({ delegatorId: user.user_id, expiry });

        // Enqueue delegation email (was already being sent before)
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

        const currentDate = new Date();
        await pool.request()
            .input('token', sql.NVarChar(sql.MAX), delegationToken)
            .input('user_id', sql.Char(8), decoded.user_id)
            .input('otp', sql.VarChar(6), otp)
            .input('first_name', sql.VarChar(50), first_name)
            .input('email_address', sql.VarChar(255), email_address)
            .input('phone_number', sql.VarChar(20), normalizedPhone)
            .input('created_at', sql.DateTime2, currentDate)
            .query(`
                INSERT INTO delegation (token, user_id, otp, first_name, email_address, phone_number, created_at)
                VALUES (@token, @user_id, @otp, @first_name, @email_address, @phone_number, @created_at)
            `);

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
            .input('token', sql.NVarChar(sql.MAX), token)
            .input('user_id', sql.Char(8), user_id)
            .input('otp', sql.VarChar(6), otp)
            .query(`SELECT * FROM delegation WHERE token = @token AND user_id = @user_id AND otp = @otp AND created_at > DATEADD(HOUR, -48, GETDATE())`);

        if (delegationResult.recordset.length === 0) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid delegation details' } };
        }

        const delegation = delegationResult.recordset[0];
        const hashedPassword = await hashPassword(newpassword);

        await pool.request()
            .input('first_name', sql.VarChar(50), delegation.first_name)
            .input('email_address', sql.VarChar(255), delegation.email_address)
            .input('phone_number', sql.VarChar(20), delegation.phone_number)
            .input('password', sql.VarChar(255), hashedPassword)
            .input('user_id', sql.Char(8), user_id)
            .query(`UPDATE Users SET first_name = @first_name, email_address = @email_address, phone_number = @phone_number, password = @password WHERE user_id = @user_id`);

        await pool.request()
            .input('user_id', sql.Char(8), user_id)
            .query(`DELETE FROM delegation WHERE user_id = @user_id`);

        // Enqueue delegation accepted email (was already being sent before)
        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'delegation_accepted',
            payload: {
                new_email: delegation.email_address,
                old_email: ''
            }
        });

        const user = await getUserById(user_id, event);

        const jwtToken = await signJWT({
            user_id: user.user_id,
            permissions: user.permissions,
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        });

        await setLastLogin(user.user_id, event.requestContext?.identity?.sourceIp);

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