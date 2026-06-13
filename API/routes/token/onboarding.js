// ====================== routes/token/onboarding.js ======================
// Slim consolidated handler for onboarding actions
// Actions supported: generate, validate, complete, complete-signup
// Last updated: 13 June 2026

const { logger, getDbConnection, sql, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');
const { getStripeClient } = require('/opt/nodejs/stripe');

// Focused local helpers only
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

// ====================== ACTION HANDLERS ======================

async function handleGenerate(event, { pool, sandbox = false }) {
    // TODO: Full implementation (Stripe account creation + token + email/SMS)
    return {
        statusCode: 200,
        body: { status: 'success', message: 'Generate action received' }
    };
}

async function handleValidate(event, { pool, sandbox = false }) {
    const body = parseBody(event);
    const { token, pin } = body;

    if (!token || !pin) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Token and PIN required' } };
    }

    const data = await getOnboardingData(pin);
    if (!data) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired PIN' } };
    }

    // TODO: Create real Stripe Account Link here
    return {
        statusCode: 200,
        body: {
            status: 'success',
            account_link: 'https://connect.stripe.com/setup/placeholder'
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

    // Cleanup used OTP
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

    const hashed = await require('bcryptjs').hash(password, 10);
    await updateUser(user.user_id, hashed, null, null, pool);

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