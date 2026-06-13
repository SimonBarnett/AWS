// ====================== routes/token/onboarding.js ======================
// Consolidated single handler for all onboarding-related actions
// Actions: generate, validate, complete, complete-signup
// Uses SystemOTPs + SQS enqueues for emails and ClubScan
// Last updated: 13 June 2026

const { logger, getDbConnection, sql, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');
const { getStripeClient } = require('/opt/nodejs/stripe');
const { generateUserId } = require('/opt/nodejs/auth-utils');

// Local helpers
const {
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

// ====================== HELPER: Get onboarding data from SystemOTPs ======================
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

        return {
            ...record,
            ...payload,
            referrer_by: record.user_id
        };
    } finally {
        await pool.close();
    }
}

// ====================== ACTION: generate ======================
async function handleGenerate(event, { pool, sandbox = false }) {
    const body = parseBody(event);
    const { mobile, email, tokenType, url, communityId } = body;

    if (!mobile || !email || !tokenType) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Phone, email and tokenType are required' } };
    }

    // TODO: Add full logic from old generateOnboardingToken.js (Stripe account creation, token generation, email/SMS)
    // For now return placeholder
    return {
        statusCode: 200,
        body: { status: 'success', message: 'Onboarding token generation triggered (consolidated handler)' }
    };
}

// ====================== ACTION: validate ======================
async function handleValidate(event, { pool, sandbox = false }) {
    const body = parseBody(event);
    const { token, pin } = body;

    if (!token || !pin) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Token and PIN are required' } };
    }

    const onboardingData = await getOnboardingData(pin); // Using pin as OTP lookup
    if (!onboardingData) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired token/PIN' } };
    }

    // TODO: Full Stripe Account Link creation logic
    // For now return a placeholder account_link
    return {
        statusCode: 200,
        body: {
            status: 'success',
            account_link: 'https://connect.stripe.com/setup/e/acct_xxx' // placeholder
        }
    };
}

// ====================== ACTION: complete (final onboarding step) ======================
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
    } catch (error) {
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to initialize Stripe' } };
    }

    let stripeAccount;
    try {
        stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
    } catch (error) {
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to retrieve Stripe account' } };
    }

    // Generate unique User ID
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
        const individual = stripeAccount.individual || {};
        userData.first_name = individual.first_name || null;
        userData.last_name = individual.last_name || null;
        userData.dob = individual.dob ? JSON.stringify(individual.dob) : null;
        userData.address = individual.address || null;
        userData.ssn_last_4 = individual.ssn_last_4 || null;
    } else if (role === 'merchant' || role === 'partner') {
        const company = stripeAccount.company || {};
        userData.company_name = company.name || null;
        userData.tax_id = company.tax_id || null;
        userData.address = company.address || null;
    }

    if (role === 'community' && !userData.first_name && logEmail) {
        userData.first_name = logEmail.split('@')[0];
    }
    if (role === 'merchant' && !userData.company_name && logEmail) {
        userData.company_name = logEmail.split('@')[0];
    }

    await createUser(userData);

    // Enqueue ONBOARDING for ClubScan (communities)
    if (role === 'community' && onboardingData.url) {
        await enqueueMessage({
            type: 'ONBOARDING',
            userId,
            url: onboardingData.url,
            partnerId: onboardingData.referrer_by,
            sandbox: isSandbox
        });
    }

    // Enqueue partner onboarded email
    if (role === 'partner' && onboardingData.url) {
        await enqueueMessage({
            type: 'SEND_EMAIL',
            emailType: 'partner_onboarded',
            payload: {
                partnerEmail: logEmail,
                url: onboardingData.url,
                partnerId: userId
            }
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
    const decodedSignupUrl = new URL(signupUrl).href;

    const redirectUrl = buildSetTokenUrl(
        decodedSignupUrl,
        token,
        userId,
        contactName,
        'signup',
        isSandbox,
        'This is your first login.'
    );

    // Delete used OTP
    const deletePool = await getDbConnection();
    try {
        await deletePool.request()
            .input('otp_id', sql.Int, onboardingData.otp_id)
            .query('DELETE FROM SystemOTPs WHERE otp_id = @otp_id');
    } finally {
        await deletePool.close();
    }

    return {
        statusCode: 302,
        headers: { Location: redirectUrl },
        body: ''
    };
}

// ====================== ACTION: complete-signup ======================
async function handleCompleteSignup(event, { pool, sandbox = false }) {
    const body = parseBody(event);
    const { password, confirm_password, authToken, signup_url } = body;

    if (!password || !confirm_password || !authToken) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Password, confirm_password and authToken are required' } };
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

    const hashedPassword = await require('bcryptjs').hash(password, 10);
    await updateUser(user.user_id, hashedPassword, null, null, pool);

    const token = await signJWT({
        user_id: user.user_id,
        permissions: user.permissions,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    });

    await setLastLogin(user.user_id, event.requestContext?.identity?.sourceIp, pool);

    const contactName = user.company_name || user.first_name || user.user_id;

    return {
        statusCode: 200,
        body: {
            status: 'success',
            token,
            user_id: user.user_id,
            contact_name: contactName,
            workflow: 'login'
        }
    };
}

// ====================== MAIN HANDLER ======================
module.exports = async (event, { action, pool, sandbox = false } = {}) => {
    try {
        switch (action) {
            case 'generate':
                return await handleGenerate(event, { pool, sandbox });

            case 'validate':
                return await handleValidate(event, { pool, sandbox });

            case 'complete':
                return await handleComplete(event, { pool, sandbox });

            case 'complete-signup':
                return await handleCompleteSignup(event, { pool, sandbox });

            default:
                return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
        }
    } catch (error) {
        logger.error('Error in onboarding handler', { action, error: error.message });
        return {
            statusCode: 500,
            body: { status: 'error', error_message: error.message || 'Internal Server Error' }
        };
    }
};