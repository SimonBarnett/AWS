// routes/onboarding.js
const { signJwt, logger, getDbConnection, sql, getStripeClient, generateUserId, isUserIdUnique, createUser, capturePostHogEvent, addToClubScan, confirmOnboarding, buildSetTokenUrl } = require('../helpers');
const { sendCPOnboardedEmail } = require('../emails');

async function getOnboardingData(token) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('token_id', sql.VarChar, token)
            .query('SELECT * FROM Tokens WHERE token_id = @token_id');
        if (result.recordset.length === 0) {
            return null;
        }
        return result.recordset[0];
    } catch (error) {
        logger.error('Failed to retrieve onboarding data', { token, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}

async function validateOnboardingToken(tokenData, requestId) {
    if (!tokenData) {
        logger.warn('Token data not found', { requestId });
        return { valid: false, reason: 'Invalid token' };
    }

    const issuedAt = new Date(tokenData.issued_at);
    const validityPeriod = 48 * 60 * 60 * 1000; // 48 hours
    if (Date.now() > issuedAt.getTime() + validityPeriod) {
        logger.warn('Token expired', { requestId, token: tokenData.token_id });
        return { valid: false, reason: 'Token expired' };
    }

    return { valid: true };
}

async function getLastLogin(userId) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('user_id', sql.VarChar, userId)
            .query(`
                SELECT TOP 1 [timestamp], IP
                FROM [PostHogEvents]
                WHERE source = @user_id
                ORDER BY [timestamp] DESC
            `);
        return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
        logger.error('Failed to retrieve last login', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}

async function handler(event, headers, requestId, ipAddress) {
    const queryParams = event.queryStringParameters || {};
    const { token: queryToken } = queryParams;

    if (!queryToken) {
        logger.warn('Missing token', { requestId });
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ status: 'error', error_message: 'Token is required' })
        };
    }

    const onboardingData = await getOnboardingData(queryToken);
    const tokenValidation = await validateOnboardingToken(onboardingData, requestId);
    if (!tokenValidation.valid) {
        logger.warn('Token validation failed', { requestId, reason: tokenValidation.reason });
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ status: 'error', error_message: tokenValidation.reason })
        };
    }

    let stripe;
    try {
        event.headers.origin = onboardingData.signup_url;
        stripe = await getStripeClient(event);
    } catch (error) {
        logger.error('Failed to get Stripe client', { requestId, error: error.message });
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ status: 'error', error_message: 'Failed to initialize Stripe' })
        };
    }

    const role = onboardingData.tokenType;
    const stripe_account_id = onboardingData.stripe_account_id;
    let affiliate_code = onboardingData.referrer_by;
    if (['merchant'].includes(role)) {
        affiliate_code = onboardingData.origin_code;
    }
    const signup_url = onboardingData.signup_url;

    let decodedSignupUrl;
    try {
        decodedSignupUrl = new URL(signup_url).href;
    } catch (err) {
        logger.warn('Invalid signup_url from database', { requestId, signup_url });
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ status: 'error', error_message: 'Invalid signup_url' })
        };
    }

    if (!['merchant', 'community', 'partner'].includes(role)) {
        logger.warn('Invalid role', { requestId, role });
        return {
            statusCode: 400,  // Changed from 200 to proper error code
            headers,
            body: JSON.stringify({ status: 'error', error_message: 'Invalid role' })
        };
    }

    let stripeAccount;
    try {
        stripeAccount = await stripe.accounts.retrieve(stripe_account_id);
    } catch (stripeError) {
        logger.error('Failed to retrieve Stripe account', {
            requestId,
            stripe_account_id,
            error: stripeError.message
        });
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ status: 'error', error_message: 'Failed to retrieve Stripe account' })
        };
    }

    let userId;
    let attempts = 0;
    const maxAttempts = 25;
    do {
        userId = generateUserId();
        attempts++;
    } while (!(await isUserIdUnique(userId)) && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
        logger.error('Failed to generate unique user_id after max attempts', { requestId });
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ status: 'error', error_message: 'Failed to generate unique user ID' })
        };
    }

    const logEmail = stripeAccount.email || onboardingData.email;
    const logPhone = stripeAccount.phone || onboardingData.phone;
    const permissions = [role];
    const userData = {
        user_id: userId,
        email_address: logEmail,
        permissions,
        stripe_account_id,
        role,
        referrer: affiliate_code,
        phone_number: logPhone
    };

    if (role === 'community') {
        const individual = stripeAccount.individual || {};
        userData.first_name = individual.first_name || null;
        userData.last_name = individual.last_name || null;
        userData.dob = individual.dob ? JSON.stringify(individual.dob) : null;
        userData.address = individual.address ? individual.address : null;
        userData.ssn_last_4 = individual.ssn_last_4 || null;
    } else if (role === 'merchant' || role === 'partner') {
        const company = stripeAccount.company || {};
        userData.company_name = company.name || null;
        userData.tax_id = company.tax_id || null;
        userData.address = company.address ? company.address : null;
    }

    // Sandbox fallback for names
    if (role === 'community' && !userData.first_name) {
        const emailToUse = logEmail;
        userData.first_name = emailToUse ? emailToUse.split('@')[0] : userId;
        logger.debug('Set first_name from email in sandbox mode', { userId, first_name: userData.first_name });
    } else if (role === 'merchant' && !userData.company_name) {
        const emailToUse = logEmail;
        userData.company_name = emailToUse ? emailToUse.split('@')[0] : userId;
        logger.debug('Set company_name from email in sandbox mode', { userId, company_name: userData.company_name });
    }

    await createUser(userData);
    logger.info('User created successfully', {
        userId,
        email: logEmail,
        role,
        permissions,
        referrer: affiliate_code,
        phone: logPhone
    });

    // Update signupurl for partners
    if (role === 'partner' && onboardingData.url) {
        const updatePool = await getDbConnection();
        try {
            await updatePool.request()
                .input('user_id', sql.VarChar, userId)
                .input('signupurl', sql.VarChar, onboardingData.url)
                .query('UPDATE Users SET signupurl = @signupurl WHERE user_id = @user_id');
            logger.info('Updated signupurl for partner', { userId, signupurl: onboardingData.url });
        } catch (updateError) {
            logger.error('Failed to update signupurl for partner', { userId, error: updateError.message });
        } finally {
            updatePool.close();
        }
    }

    await capturePostHogEvent(userId, 'signup', {
        user_id: userId,
        role,
        timestamp: new Date().toISOString(),
        affiliate_code,
        ip_address: ipAddress
    });

    if (role === 'community') {
        await addToClubScan(onboardingData.url, onboardingData.origin_code, userId);
    }

    if (role === 'partner' && onboardingData.url) {
        await sendCPOnboardedEmail(logEmail, onboardingData.url, userId);
    }

    if (role === 'merchant') {
        logger.debug('Starting confirmOnboarding', { requestId, merchantId: userId, resellerId: onboardingData.referrer_by });
        const paymentResult = await confirmOnboarding(userId, onboardingData.referrer_by, event);
        logger.debug('confirmOnboarding completed', { requestId, paymentStatus: paymentResult.statusCode });

        if (paymentResult.statusCode !== 200) {
            return {
                statusCode: paymentResult.statusCode,
                headers,
                body: JSON.stringify({ status: 'error', error_message: 'Payment failed', details: paymentResult.body })
            };
        }
    }

    // ────────────────────────────────────────────────
    // FIXED: Await the JWT signing!
    // ────────────────────────────────────────────────
    let token;
    try {
        const payload = {
            user_id: userData.user_id,
            permissions: userData.permissions,
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
        };
        token = await signJwt(payload);  // ← Critical fix: await here
        logger.debug('JWT generated successfully', { userId });
    } catch (jwtError) {
        logger.error('Failed to sign JWT', { requestId, userId, error: jwtError.message });
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ status: 'error', error_message: 'Failed to generate authentication token' })
        };
    }

    const contactName = userData.company_name || userData.first_name || userId;

    // Construct redirect URL
    const isSandbox = !stripeAccount.email || stripeAccount.email.trim() === '';
    
    logger.debug('JWT token before redirect', {
        requestId,
        tokenType: typeof token,
        isString: typeof token === 'string',
        tokenLength: typeof token === 'string' ? token.length : null,
        tokenPreview: typeof token === 'string' ? token.slice(0, 30) + '...' : String(token).slice(0, 50)
    });
    
    if (typeof token !== 'string') {
        logger.error('Token is not a string before building URL!', {
            requestId,
            tokenValue: JSON.stringify(token, null, 2),
            tokenType: typeof token
        });
        // You can early-return an error here if you want to block bad redirects
    }

    const redirectUrl = buildSetTokenUrl(
        decodedSignupUrl,
        token,               // ← now a real string, not Promise
        userId,
        contactName,
        'signup',
        isSandbox,
        'This is your first login.'
    );
    logger.info('Redirecting to set-token.html', { redirectUrl });

    // Clean up token
    const deletePool = await getDbConnection();
    try {
        await deletePool.request()
            .input('token_id', sql.VarChar, queryToken)
            .query('DELETE FROM Tokens WHERE token_id = @token_id');
        logger.info('Deleted token from Tokens table', { token_id: queryToken });
    } catch (deleteError) {
        logger.error('Failed to delete token from Tokens table', { token_id: queryToken, error: deleteError.message });
        // Non-fatal — continue
    } finally {
        deletePool.close();
    }

    const redirectHeaders = {
        'Location': redirectUrl,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Authorisation'
    };

    return {
        statusCode: 302,
        headers: redirectHeaders,
        body: ''
    };
}

module.exports = { handler };