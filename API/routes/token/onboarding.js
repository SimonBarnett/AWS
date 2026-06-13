// ====================== routes/token/onboarding.js ======================
// Onboarding flow - creates user from onboarding token + Stripe account
// For communities: properly starts the ClubScan SQS pipeline
// Last updated: 03 June 2026

const { logger, getDbConnection, sql, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');
const { getStripeClient } = require('/opt/nodejs/stripe');
const { generateUserId } = require('/opt/nodejs/auth-utils');

// Local helpers
const {
    isUserIdUnique,
    createUser,
    capturePostHogEvent,
    confirmOnboarding,
    buildSetTokenUrl,
    setLastLogin
} = require('./helpers');

async function getOnboardingData(token) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('token_id', sql.VarChar, token)
            .query('SELECT * FROM Tokens WHERE token_id = @token_id');
        return result.recordset[0] || null;
    } finally {
        await pool.close();
    }
}

async function validateOnboardingToken(tokenData) {
    if (!tokenData) return { valid: false, reason: 'Invalid token' };
    const issuedAt = new Date(tokenData.issued_at);
    if (Date.now() > issuedAt.getTime() + (48 * 60 * 60 * 1000)) {
        return { valid: false, reason: 'Token expired' };
    }
    return { valid: true };
}

module.exports = async (event) => {
    const queryToken = event.queryStringParameters?.token;
    if (!queryToken) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Token is required' } };
    }

    const onboardingData = await getOnboardingData(queryToken);
    const validation = await validateOnboardingToken(onboardingData);
    if (!validation.valid) {
        return { statusCode: 400, body: { status: 'error', error_message: validation.reason } };
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
        logger.error('Failed to initialize Stripe client', { error: error.message });
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to initialize Stripe' } };
    }

    let stripeAccount;
    try {
        stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
    } catch (error) {
        logger.error('Failed to retrieve Stripe account', { stripeAccountId, error: error.message });
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
    logger.info('User created from onboarding', { userId, role, email: logEmail });

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

    // ====================== START CLUBSCAN PIPELINE ======================
    if (role === 'community' && onboardingData.url) {
        let pool;
        try {
            pool = await getDbConnection();

            // Insert into clubscan table
            await pool.request()
                .input('url', sql.NVarChar, onboardingData.url)
                .input('clubId', sql.VarChar, userId)
                .input('partnerId', sql.VarChar, onboardingData.referrer_by || null)
                .input('status', sql.VarChar, 'queued')
                .query(`
                    MERGE INTO clubscan AS target
                    USING (SELECT @url AS Url) AS source
                    ON target.Url = source.Url
                    WHEN NOT MATCHED THEN
                        INSERT (Url, ClubID, PartnerId, Status, CreatedAt, UpdatedAt)
                        VALUES (@url, @clubId, @partnerId, @status, GETDATE(), GETDATE());
                `);

            // Start ClubScan pipeline via SQS
            await enqueueMessage({
                type: 'CLUBSCAN_FETCH_CONTENT',
                url: onboardingData.url
            });

            logger.info('✅ ClubScan pipeline started via SQS', { userId, url: onboardingData.url });

        } catch (err) {
            logger.error('Failed to start ClubScan pipeline', { 
                userId, 
                url: onboardingData.url, 
                error: err.message 
            });
        } finally {
            if (pool) await pool.close();
        }
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

    const deletePool = await getDbConnection();
    try {
        await deletePool.request()
            .input('token_id', sql.VarChar, queryToken)
            .query('DELETE FROM Tokens WHERE token_id = @token_id');
    } finally {
        await deletePool.close();
    }

    return {
        statusCode: 302,
        headers: { Location: redirectUrl },
        body: ''
    };
};