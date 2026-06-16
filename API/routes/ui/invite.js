// API/routes/ui/invite.js

const {
    logger,
    getDbConnection,
    sql,
    enqueueMessage
} = require('/opt/nodejs/helpers');

const { signJWT } = require('/opt/nodejs/jwt');
const { getStripeClient } = require('/opt/nodejs/stripe');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');

/**
 * POST /ui/invite
 *
 * Authenticated endpoint for partners, admins, and owners to invite new users.
 * Uses the modern SystemOTPs table.
 * Email sending is handled asynchronously via the catalogue SQS queue.
 */
module.exports.handler = async (event, body, requestId) => {
    logger.debug('Handling /ui/invite route', { requestId });

    const { decoded } = event;

    if (!decoded || !decoded.user_id) {
        return {
            statusCode: 401,
            body: JSON.stringify({ status: 'error', error_message: 'Invalid token' })
        };
    }

    // Get user and check permissions
    const user = await getUserById(decoded.user_id, event);
    if (!user) {
        logger.warn('User not found', { requestId, userId: decoded.user_id });
        return {
            statusCode: 404,
            body: JSON.stringify({ status: 'error', error_message: 'User not found' })
        };
    }

    if (!user.permissions.includes('admin') &&
        !user.permissions.includes('partner') &&
        !user.permissions.includes('owner')) {
        return {
            statusCode: 403,
            body: JSON.stringify({ status: 'error', error_message: 'Forbidden: Requires admin, partner or owner permission' })
        };
    }

    // Parse body
    let parsedBody = {};
    try {
        parsedBody = typeof body === 'string' ? JSON.parse(body) : body || {};
    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ status: 'error', error_message: 'Invalid JSON body' })
        };
    }

    const { mobile, email, tokenType, url, communityId } = parsedBody;

    if (!mobile || !email || !tokenType) {
        return {
            statusCode: 400,
            body: JSON.stringify({ status: 'error', error_message: 'Phone, email and tokenType are required' })
        };
    }

    const normalizedPhone = normalizePhone(mobile);
    if (!isValidPhone(normalizedPhone) || !isValidEmail(email)) {
        return {
            statusCode: 400,
            body: JSON.stringify({ status: 'error', error_message: 'Invalid phone or email format' })
        };
    }

    // Permission + URL validation
    if (!user.permissions.includes('admin')) {
        if (!user.permissions.includes('owner') && !user.permissions.includes('partner')) {
            return {
                statusCode: 403,
                body: JSON.stringify({ status: 'error', error_message: 'Insufficient permission' })
            };
        }

        if (!user.permissions.includes('owner') && tokenType !== 'merchant') {
            return {
                statusCode: 403,
                body: JSON.stringify({ status: 'error', error_message: 'Only site owners can invite communities or partners' })
            };
        }

        const targetUrl = url || communityId;
        if ((tokenType === 'community' || tokenType === 'partner') && !targetUrl) {
            return {
                statusCode: 400,
                body: JSON.stringify({ status: 'error', error_message: 'URL is required for this invitation type' })
            };
        }
    }

    const pool = await getDbConnection();

    // Check if email already exists
    const userCheck = await pool.request()
        .input('email', sql.VarChar(255), email)
        .query(`SELECT COUNT(*) AS count FROM [madeiradb].[dbo].[Users] WHERE email_address = @email`);

    if (userCheck.recordset[0].count > 0) {
        await pool.close();
        return {
            statusCode: 409,
            body: JSON.stringify({ status: 'error', error_message: 'The email address is already in use.' })
        };
    }

    // Check for existing valid onboarding OTP
    const otpCheck = await pool.request()
        .input('email', sql.VarChar(255), email)
        .query(`
            SELECT COUNT(*) AS count 
            FROM [madeiradb].[dbo].[SystemOTPs] 
            WHERE email = @email 
              AND token_type = 'onboarding' 
              AND expires_at > GETDATE()
        `);

    if (otpCheck.recordset[0].count > 0) {
        await pool.close();
        return {
            statusCode: 409,
            body: JSON.stringify({ status: 'error', error_message: 'The email address has a pending invite.' })
        };
    }

    await pool.close();

    // Create Stripe account
    let stripe;
    try {
        stripe = await getStripeClient(event);
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'error', error_message: 'Failed to initialize Stripe' })
        };
    }

    const account = await stripe.accounts.create({ type: 'express' });

    // Generate PIN and JWT
    const pin = generatePin();
    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const signup_url = event.headers.origin || 'https://greenfieldsites.clubmadeira.io';

    const tokenPayload = {
        referrerId: user.user_id,
        expiry: expiry.toISOString()
    };

    const onboardingToken = await signJWT(tokenPayload);

    // Prepare payload for SystemOTPs
    const payload = JSON.stringify({
        email,
        phone: normalizedPhone,
        tokenType,
        url: url || communityId || null,
        stripe_account_id: account.id,
        signup_url,
        referrerId: user.user_id
    });

    // Insert into SystemOTPs
    const insertPool = await getDbConnection();
    try {
        await insertPool.request()
            .input('otp', sql.VarChar(10), pin)
            .input('user_id', sql.Char(8), user.user_id)
            .input('token_type', sql.VarChar(50), 'onboarding')
            .input('expires_at', sql.DateTime, expiry)
            .input('payload', sql.NVarChar(sql.MAX), payload)
            .query(`
                INSERT INTO [madeiradb].[dbo].[SystemOTPs] 
                (otp, user_id, token_type, expires_at, payload)
                VALUES (@otp, @user_id, @token_type, @expires_at, @payload)
            `);
    } finally {
        insertPool.close();
    }

    // Enqueue email sending to the catalogue SQS queue
    await enqueueMessage({
        type: 'SEND_EMAIL',
        payload: {
            to: email,
            onboardingToken,
            phone: normalizedPhone,
            signup_url,
            tokenType,
            url: url || communityId || null
        }
    });

    // Send PIN via SMS
    const smsMessage = `Your onboarding PIN is ${pin}. It expires in 48 hours.`;
    const smsSuccess = await sendSmsTextmagic(normalizedPhone, smsMessage);
    if (!smsSuccess) {
        logger.error('Failed to send PIN SMS', { requestId, phone: normalizedPhone });
        return {
            statusCode: 500,
            body: JSON.stringify({ status: 'error', error_message: 'Failed to send PIN' })
        };
    }

    logger.info('Invite created successfully via /ui/invite', {
        requestId,
        email,
        tokenType,
        invitedBy: user.user_id
    });

    return {
        statusCode: 200,
        body: JSON.stringify({
            status: 'success',
            message: 'Invite created successfully'
        })
    };
};