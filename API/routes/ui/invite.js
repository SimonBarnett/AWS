// API/routes/ui/invite.js

const {
    logger,
    sql,
    enqueueMessage
} = require('/opt/nodejs/helpers');

const { signJWT } = require('/opt/nodejs/jwt');
const { getStripeClient } = require('/opt/nodejs/stripe');

const {
    normalizePhone,
    isValidPhone,
    isValidEmail,
    generatePin
} = require('../token/helpers');

module.exports.handler = async (event, { pool, sandbox }) => {
    logger.debug('Handling POST /ui/invite');

    const { decoded } = event;

    if (!decoded?.user_id) {
        return { statusCode: 401, body: JSON.stringify({ status: 'error', error_message: 'Invalid token' }) };
    }

    const userResult = await pool.request()
        .input('user_id', sql.Char(8), decoded.user_id)
        .query(`SELECT user_id, permissions FROM Users WHERE user_id = @user_id`);

    const user = userResult.recordset[0];
    if (!user) {
        return { statusCode: 404, body: JSON.stringify({ status: 'error', error_message: 'User not found' }) };
    }

    if (!user.permissions.includes('admin') &&
        !user.permissions.includes('partner') &&
        !user.permissions.includes('owner')) {
        return { statusCode: 403, body: JSON.stringify({ status: 'error', error_message: 'Forbidden' }) };
    }

    let body = {};
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch {
        return { statusCode: 400, body: JSON.stringify({ status: 'error', error_message: 'Invalid JSON' }) };
    }

    const { mobile, email, tokenType, url, communityId } = body;

    if (!mobile || !email || !tokenType) {
        return { statusCode: 400, body: JSON.stringify({ status: 'error', error_message: 'Phone, email and tokenType required' }) };
    }

    const normalizedPhone = normalizePhone(mobile);
    if (!isValidPhone(normalizedPhone) || !isValidEmail(email)) {
        return { statusCode: 400, body: JSON.stringify({ status: 'error', error_message: 'Invalid phone or email' }) };
    }

    if (!user.permissions.includes('admin')) {
        if (!user.permissions.includes('owner') && tokenType !== 'merchant') {
            return { statusCode: 403, body: JSON.stringify({ status: 'error', error_message: 'Only owners can invite communities/partners' }) };
        }
    }

    // Check existing user
    const userCheck = await pool.request()
        .input('email', sql.VarChar(255), email)
        .query(`SELECT COUNT(*) AS count FROM Users WHERE email_address = @email`);

    if (userCheck.recordset[0].count > 0) {
        return { statusCode: 409, body: JSON.stringify({ status: 'error', error_message: 'Email already in use' }) };
    }

    // Check pending invite
    const pendingCheck = await pool.request()
        .input('email', sql.VarChar(255), email)
        .query(`
            SELECT COUNT(*) AS count 
            FROM SystemOTPs 
            WHERE token_type = 'onboarding' 
              AND expires_at > GETDATE()
              AND JSON_VALUE(payload, '$.email') = @email
        `);

    if (pendingCheck.recordset[0].count > 0) {
        return { statusCode: 409, body: JSON.stringify({ status: 'error', error_message: 'Pending invite exists' }) };
    }

    // Create Stripe account
    const stripe = await getStripeClient(event);
    const account = await stripe.accounts.create({ type: 'express' });

    // Generate PIN + JWT
    const pin = generatePin();
    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const signup_url = event.headers.origin || 'https://greenfieldsites.clubmadeira.io';

    const tokenPayload = {
        referrerId: user.user_id,
        expiry: expiry.toISOString()
    };

    const onboardingToken = await signJWT(tokenPayload);

    const payload = JSON.stringify({
        email,
        phone: normalizedPhone,
        tokenType,
        url: url || communityId || null,
        stripe_account_id: account.id,
        signup_url,
        referrerId: user.user_id,
        pin,
        token: onboardingToken          // ← Add this line
    });

    // Insert into SystemOTPs
    await pool.request()
        .input('otp', sql.VarChar(10), pin)
        .input('user_id', sql.Char(8), user.user_id)
        .input('token_type', sql.VarChar(50), 'onboarding')
        .input('expires_at', sql.DateTime, expiry)
        .input('payload', sql.NVarChar(sql.MAX), payload)
        .query(`
            INSERT INTO SystemOTPs (otp, user_id, token_type, expires_at, payload)
            VALUES (@otp, @user_id, @token_type, @expires_at, @payload)
        `);

    await enqueueMessage({
        type: 'SEND_EMAIL',           // For SQS orchestrator
        emailType: 'onboarding',      // For handleSendEmail
        payload: {
            email,
            token: onboardingToken,
            phone: normalizedPhone,
            signup_url,
            tokenType,
            url: url || communityId || null,
            pin
        }
    });

    return {
        statusCode: 200,
        body: JSON.stringify({
            status: 'success',
            message: 'Invite created successfully'
        })
    };
};