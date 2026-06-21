// ====================== routes/token/onboarding.js ======================
// Slim consolidated handler for onboarding actions (validate + complete only)
// handleGenerate has been moved to /ui
// Last updated: 16 June 2026

const { logger, sql, enqueueMessage , parseBody} = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');
const { getStripeClient } = require('/opt/nodejs/stripe');

// From the shared layer
const { generateUserId } = require('/opt/nodejs/auth-utils');

// From local helpers
const {
    isUserIdUnique,
    createUser,
    buildSetTokenUrl,
    setLastLogin,
    getUserById,
    isValidPassword,
    updateUser    
} = require('./helpers');

// ====================== LOCAL confirmOnboarding ======================
async function confirmOnboarding(merchantId, resellerId, event) {
    logger.info('confirmOnboarding (stub) called', { merchantId, resellerId });
    return { statusCode: 200 };
}

// ====================== SHARED HELPER ======================
async function getOnboardingData(otp, pool) {
    logger.debug('getOnboardingData called', { otp });

    const usePool = pool || await require('/opt/nodejs/helpers').getDbConnection();

    try {
        const result = await usePool.request()
            .input('otp', sql.VarChar(10), otp)
            .input('token_type', sql.VarChar(50), 'onboarding')
            .query(`
                SELECT * FROM SystemOTPs
                WHERE otp = @otp
                  AND token_type = @token_type
                  AND expires_at > GETDATE()
            `);

        if (result.recordset.length === 0) {
            logger.warn('getOnboardingData: No matching OTP found', { otp });
            return null;
        }

        const record = result.recordset[0];
        const payload = JSON.parse(record.payload || '{}');

        logger.debug('getOnboardingData: OTP found', { 
            otp, 
            tokenType: record.token_type,
            hasStripeAccount: !!payload.stripe_account_id 
        });

        return { ...record, ...payload, referrer_by: record.user_id };
    } finally {
        if (!pool && usePool) await usePool.close();
    }
}

// ====================== ACTION: validate ======================
async function handleValidate(event, { pool, sandbox = false }) {
    logger.debug('handleValidate started');

    const body = parseBody(event);
    const { token, pin } = body;

    if (!token || !pin) {
        logger.warn('handleValidate: Missing token or pin');
        return { statusCode: 400, body: { status: 'error', error_message: 'Token and PIN required' } };
    }

    const onboardingData = await getOnboardingData(pin, pool);
    if (!onboardingData) {
        logger.warn('handleValidate: Invalid or expired PIN', { pin });
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid or expired PIN' } };
    }

    logger.info('handleValidate: Onboarding data retrieved', { 
        tokenType: onboardingData.tokenType,
        hasStripeAccount: !!onboardingData.stripe_account_id 
    });

    const stripe = await getStripeClient(event);

    // ← BUG FIX: was using undefined `onboardingToken`
    const return_url = `https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/onboarding?token=${onboardingToken}`;

    const refresh_url = new URL(onboardingData.signup_url);
    refresh_url.searchParams.append('signup', 'fail');

    const account_link = await stripe.accountLinks.create({
        account: onboardingData.stripe_account_id,
        refresh_url: refresh_url.toString(),
        return_url,
        type: 'account_onboarding'
    });

    logger.info('handleValidate: Account link created successfully');

    return {
        statusCode: 200,
        body: {
            status: 'success',
            account_link: account_link.url
        }
    };
}

// ====================== ACTION: complete ======================
async function handleComplete(event, { pool, sandbox = false }) {
    const queryToken = event.queryStringParameters?.token;
    logger.debug('handleComplete started', { hasToken: !!queryToken });

    if (!queryToken) {
        return { 
            statusCode: 400, 
            body: { status: 'error', error_message: 'Token is required' } 
        };
    }

    let onboardingData;

    try {
        const dbPool = pool;

        logger.debug('handleComplete: Querying SystemOTPs');

        const result = await dbPool.request()
            .input('token', sql.NVarChar(500), queryToken)
            .query(`
                SELECT TOP 1 *
                FROM SystemOTPs
                WHERE token_type = 'onboarding'
                  AND expires_at > GETDATE()
                  AND payload LIKE '%' + @token + '%'
            `);

        if (result.recordset.length === 0) {
            logger.warn('handleComplete: Invalid or expired token');
            return { 
                statusCode: 400, 
                body: { status: 'error', error_message: 'Invalid or expired token' } 
            };
        }

        const record = result.recordset[0];
        const payload = JSON.parse(record.payload || '{}');
        onboardingData = { ...record, ...payload, referrer_by: record.user_id };

        logger.info('handleComplete: Onboarding data loaded', { 
            tokenType: onboardingData.tokenType,
            userIdToCreate: onboardingData.tokenType 
        });

        // Generate unique user_id
        let userId;
        let attempts = 0;
        const maxAttempts = 25;
        do {
            userId = generateUserId();
            attempts++;
        } while (!(await isUserIdUnique(userId, dbPool)) && attempts < maxAttempts);

        if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique user ID after 25 attempts');
        }

        logger.debug('handleComplete: Generated userId', { userId, attempts });

        const role = onboardingData.tokenType;
        const signupUrl = onboardingData.signup_url;
        const stripeAccountId = onboardingData.stripe_account_id;

        if (!signupUrl) {
            throw new Error('signup_url is missing from onboarding token payload');
        }

        event.headers = event.headers || {};
        event.headers.origin = signupUrl;

        const stripe = await getStripeClient(event);
        const stripeAccount = await stripe.accounts.retrieve(stripeAccountId);

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

        // Role-specific fields
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

        if (role === 'community' && !userData.first_name && logEmail) {
            userData.first_name = logEmail.split('@')[0];
        }
        if (role === 'merchant' && !userData.company_name && logEmail) {
            userData.company_name = logEmail.split('@')[0];
        }

        logger.debug('handleComplete: Creating user', { userId, role });

        await createUser(userData, dbPool);

        logger.info('handleComplete: User created successfully', { userId, role });

        // Enqueue messages
        if (role === 'community' && onboardingData.url) {
            await enqueueMessage({ 
                type: 'ONBOARDING', 
                userId, 
                url: onboardingData.url, 
                partnerId: onboardingData.referrer_by, 
                sandbox: sandbox 
            });
        }

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
                return paymentResult;
            }
        }

        const token = await signJWT({
            user_id: userId,
            permissions: [role],
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
        });

        await setLastLogin(userId, event.requestContext?.identity?.sourceIp, dbPool);

        const contactName = userData.company_name || userData.first_name || userId;
        const redirectUrl = buildSetTokenUrl(
            new URL(signupUrl).href, 
            token, 
            userId, 
            contactName, 
            'signup', 
            isSandbox, 
            'This is your first login.'
        );

        logger.info('Onboarding completed successfully', { 
            userId, 
            role, 
            email: logEmail 
        });

        return { 
            statusCode: 302, 
            headers: { Location: redirectUrl }, 
            body: '' 
        };

    } catch (err) {
        logger.error('handleComplete failed', { 
            error: err.message, 
            stack: err.stack,
            queryToken: queryToken?.substring(0, 20) + '...'
        });
        throw err;
    }
}

// ====================== ACTION: complete-signup ======================
async function handleCompleteSignup(event, { pool, sandbox = false }) {
    logger.debug('handleCompleteSignup started');

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

    await updateUser(user.user_id, password, null, null, pool);

    const token = await signJWT({
        user_id: user.user_id,
        permissions: user.permissions,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    });

    await setLastLogin(user.user_id, event.requestContext?.identity?.sourceIp, pool);

    logger.info('handleCompleteSignup: Password set successfully', { userId: user.user_id });

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
    logger.debug('onboarding handler dispatch', { action });

    try {
        if (action === 'validate') return await handleValidate(event, { pool, sandbox });
        if (action === 'complete') return await handleComplete(event, { pool, sandbox });
        if (action === 'complete-signup') return await handleCompleteSignup(event, { pool, sandbox });

        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
    } catch (err) {
        logger.error('Error in onboarding handler', { action, error: err.message });
        return { statusCode: 500, body: { status: 'error', error_message: err.message || 'Internal error' } };
    }
};