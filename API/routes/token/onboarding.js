// ====================== routes/token/onboarding.js ======================
// Slim consolidated handler for onboarding actions
// Last updated: 13 June 2026

const { logger, getDbConnection, sql, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');
const { getStripeClient } = require('/opt/nodejs/stripe');

const {
    generateUserId,
    isUserIdUnique,
    createUser,
    confirmOnboarding,
    buildSetTokenUrl,
    setLastLogin,
    getUserById,
    isValidPassword,
    updateUser,
    parseBody
} = require('./helpers');

// ====================== SHARED HELPER ======================
async function getOnboardingData(otp) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'onboarding')
            .query(`
                SELECT * FROM SystemOTPs
                WHERE otp = @otp
                  AND token_type = @token_type
                  AND expires_at > GETDATE()
            `);

        if (result.recordset.length === 0) return null;

        const record = result.recordset[0];
        const payload = JSON.parse(record.payload || '{}');

        return { ...record, ...payload, referrer_by: record.user_id };
    } finally {
        await pool.close();
    }
}

// ====================== ACTION: generate ======================
async function handleGenerate(event, { pool, sandbox = false }) {
    const decoded = event.decoded;
    if (!decoded) {
        return { statusCode: 401, body: { status: 'error', error_message: 'Unauthorized' } };
    }

    const body = parseBody(event);
    const { mobile, email, tokenType, url, communityId } = body;

    if (!mobile || !email || !tokenType) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Phone, email and tokenType are required' } };
    }

    const normalizedPhone = normalizePhone(mobile);
    if (!isValidPhone(normalizedPhone) || !isValidEmail(email)) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid phone or email format' } };
    }

    const user = await getUserById(decoded.user_id, event, pool);
    if (!user) {
        return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
    }

    const permissions = user.permissions || [];
    if (!permissions.includes('admin') && !permissions.includes('partner') && !permissions.includes('owner')) {
        return { statusCode: 403, body: { status: 'error', error_message: 'Insufficient permission' } };
    }

    if (!permissions.includes('admin') && tokenType !== 'merchant' && !permissions.includes('owner')) {
        return { statusCode: 403, body: { status: 'error', error_message: 'Only owners can invite communities or partners' } };
    }

    const emailCheck = await pool.request()
        .input('email', sql.VarChar(255), email.toLowerCase())
        .query('SELECT COUNT(*) AS count FROM Users WHERE email_address = @email');

    if (emailCheck.recordset[0].count > 0) {
        return { statusCode: 409, body: { status: 'error', error_message: 'The email address is already in use' } };
    }

    let stripe;
    try {
        stripe = await getStripeClient(event);
    } catch (err) {
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to initialize Stripe' } };
    }

    let account;
    try {
        account = await stripe.accounts.create({ type: 'express' });
    } catch (err) {
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to create Stripe account' } };
    }

    const pin = generatePin();
    const onboardingToken = await signJWT({
        referrerId: decoded.user_id,
        expiry: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    });

    const signup_url = event.headers.origin || 'https://greenfieldsites.clubmadeira.io';
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await pool.request()
        .input('otp', sql.VarChar(10), pin)
        .input('user_id', sql.Char(8), decoded.user_id)
        .input('token_type', sql.VarChar(50), 'onboarding')
        .input('expires_at', sql.DateTime, expiresAt)
        .input('payload', sql.NVarChar(sql.MAX), JSON.stringify({
            email,
            phone: normalizedPhone,
            tokenType,
            url: url || communityId || null,
            signup_url,
            stripe_account_id: account.id,
            referrer_by: decoded.user_id
        }))
        .query(`
            INSERT INTO SystemOTPs (otp, user_id, token_type, expires_at, payload)
            VALUES (@otp, @user_id, @token_type, @expires_at, @payload)
        `);

    await enqueueMessage({
        type: 'SEND_EMAIL',
        emailType: tokenType === 'partner' ? 'partner_invite' : 'onboarding_invite',
        payload: {
            email,
            token: onboardingToken,
            phone: normalizedPhone,
            signup_url,
            tokenType,
            url: url || communityId || null
        }
    });

    return {
        statusCode: 200,
        body: { status: 'success', message: 'Onboarding token generated successfully' }
    };
}

// ====================== ACTION: validate ======================
async function handleValidate(event, { pool, sandbox = false }) {
    const body = parseBody(event);
    const { token, pin } = body;

    if (!token || !pin) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Token and PIN required' } };
    }

    const onboardingData = await getOnboardingData(pin);
    if (!onboardingData) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired PIN' } };
    }

    const stripe = await getStripeClient(event);

    const return_url = `${event.headers.origin || 'https://greenfieldsites.clubmadeira.io'}/login/onboarding?token=${token}`;
    const refresh_url = new URL(onboardingData.signup_url);
    refresh_url.searchParams.append('signup', 'fail');

    const account_link = await stripe.accountLinks.create({
        account: onboardingData.stripe_account_id,
        refresh_url: refresh_url.toString(),
        return_url,
        type: 'account_onboarding'
    });

    return {
        statusCode: 200,
        body: {
            status: 'success',
            account_link: account_link.url
        }
    };
}

async function handleComplete(event, { pool, sandbox = false }) {
    const queryToken = event.queryStringParameters?.token;
    if (!queryToken) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Token is required' } };
    }

    const onboardingData = await getOnboardingData(queryToken);
    if (!onboardingData) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired token' } };
    }

    const role = onboardingData.tokenType;
    const signupUrl = onboardingData.signup_url;
    const stripeAccountId = onboardingData.stripe_account_id;

    event.headers = event.headers || {};
    event.headers.origin = signupUrl;

    let stripe;
    try {
        stripe = await getStripeClient(event);
    } catch (err) {
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to initialize Stripe' } };
    }

    let stripeAccount;
    try {
        stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
    } catch (err) {
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to retrieve Stripe account' } };
    }

    let userId;
    let attempts = 0;
    const maxAttempts = 25;
    do {
        userId = generateUserId();
        attempts++;
    } while (!(await isUserIdUnique(userId)) && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to generate unique user ID' } };
    }

    const isSandbox = stripe.isSandbox;
    const logEmail = stripeAccount.email || onboardingData.email;
    const logPhone = stripeAccount.phone || onboardingData.phone;

    const userData = {
        user_id: userId,
        email_address: logEmail,
        permissions: [role],
        stripe_account_id: stripeAccountId,
        role,
        referrer: onboardingData.referrer_by,
        phone_number: logPhone
    };

    if (role === 'community') {
        const ind = stripeAccount.individual || {};
        userData.first_name = ind.first_name || null;
        userData.last_name = ind.last_name || null;
        userData.dob = ind.dob ? JSON.stringify(ind.dob) : null;
        userData.address = ind.address || null;
        userData.ssn_last_4 = ind.ssn_last_4 || null;
    } else if (role === 'merchant' || role === 'partner') {
        const comp = stripeAccount.company || {};
        userData.company_name = comp.name || null;
        userData.tax_id = comp.tax_id || null;
        userData.address = comp.address || null;
    }

    if (role === 'community' && !userData.first_name && logEmail) userData.first_name = logEmail.split('@')[0];
    if (role === 'merchant' && !userData.company_name && logEmail) userData.company_name = logEmail.split('@')[0];

    await createUser(userData);

    if (role === 'community' && onboardingData.url) {
        await enqueueMessage({
            type: 'ONBOARDING',
            userId,
            url: onboardingData.url,
            partnerId: onboardingData.referrer_by,
            sandbox: isSandbox
        });
    }

    if (role === 'partner' && onboardingData.url) {
        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'partner_onboarded',
            payload: { partnerEmail: logEmail, url: onboardingData.url, partnerId: userId }
        });
    }

    if (role === 'merchant') {
        const paymentResult = await confirmOnboarding(userId, onboardingData.referrer_by, event);
        if (paymentResult.statusCode !== 200) {
            return { statusCode: paymentResult.statusCode, body: { status: 'error', error_message: 'Payment failed' } };
        }
    }

    const token = await signJWT({
        user_id: userId,
        permissions: [role],
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    });

    await setLastLogin(userId, event.requestContext?.identity?.sourceIp);

    const contactName = userData.company_name || userData.first_name || userId;
    const redirectUrl = buildSetTokenUrl(new URL(signupUrl).href, token, userId, contactName, 'signup', isSandbox, 'This is your first login.');

    const delPool = await getDbConnection();
    try {
        await delPool.request()
            .input('otp_id', sql.Int, onboardingData.otp_id)
            .query('DELETE FROM SystemOTPs WHERE otp_id = @otp_id');
    } finally {
        await delPool.close();
    }

    return { statusCode: 302, headers: { Location: redirectUrl }, body: '' };
}

async function handleCompleteSignup(event, { pool, sandbox = false }) {
    const body = parseBody(event);
    const { password, confirm_password, authToken } = body;

    if (!password || !confirm_password || !authToken) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Missing required fields' } };
    }
    if (password !== confirm_password) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Passwords do not match' } };
    }
    if (!isValidPassword(password)) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid password format' } };
    }

    let decoded;
    try {
        decoded = await require('/opt/nodejs/jwt').verifyJWT(authToken);
    } catch (err) {
        return { statusCode: 401, body: { status: 'error', error_message: 'Invalid token' } };
    }

    const user = await getUserById(decoded.user_id, event, pool);
    if (!user) {
        return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
    }

    // Pass plain password - updateUser will hash it using core layer hashPassword
    await updateUser(user.user_id, password, null, null, pool);

    const token = await signJWT({
        user_id: user.user_id,
        permissions: user.permissions,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    });

    await setLastLogin(user.user_id, event.requestContext?.identity?.sourceIp, pool);

    return {
        statusCode: 200,
        body: {
            status: 'success',
            token,
            user_id: user.user_id,
            contact_name: user.company_name || user.first_name || user.user_id,
            workflow: 'login'
        }
    };
}

// ====================== MAIN DISPATCH ======================
module.exports = async (event, { action, pool, sandbox = false } = {}) => {
    try {
        if (action === 'generate') return await handleGenerate(event, { pool, sandbox });
        if (action === 'validate') return await handleValidate(event, { pool, sandbox });
        if (action === 'complete') return await handleComplete(event, { pool, sandbox });
        if (action === 'complete-signup') return await handleCompleteSignup(event, { pool, sandbox });

        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
    } catch (err) {
        logger.error('Error in onboarding handler', { action, error: err.message });
        return { statusCode: 500, body: { status: 'error', error_message: err.message || 'Internal error' } };
    }
};