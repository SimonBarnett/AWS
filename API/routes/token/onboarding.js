// API/routes/token/onboarding.js
// Consolidated single file - FULL UNABRIDGED logic for generate, validate, complete, complete-signup

const { logger, sql, getStripeClient, enqueueMessage } = require('/opt/nodejs/helpers');
const { signJWT, verifyJWT } = require('/opt/nodejs/jwt');
const { sendEmail, sendCPOnboardedEmail } = require('./email');
const { sendSmsTextmagic } = require('/opt/nodejs/sms');

const {
    generatePin, normalizePhone, isValidPhone, isValidEmail,
    getUserById, isUserIdUnique, createUser, capturePostHogEvent,
    confirmOnboarding, buildSetTokenUrl, setLastLogin,
    originCode, getTrafficAv
} = require('./helpers');

const { generateUserId } = require('/opt/nodejs/auth-utils');

module.exports = async (event, { action, pool, sandbox = false }) => {
    const body = event.body ? JSON.parse(event.body) : {};
    const query = event.queryStringParameters || {};

    // ==================== generate (FULL) ====================
    if (action === 'generate') {
        const decoded = event.decoded;

        const user = await getUserById(decoded.user_id, event);
        if (!user) {
            return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
        }

        if (!user.permissions.includes('admin') && !user.permissions.includes('partner')) {
            return { statusCode: 403, body: { status: 'error', error_message: 'Forbidden: Requires admin or partner permission' } };
        }

        const { mobile, email, tokenType, url, communityId } = body;

        if (!mobile || !email || !tokenType) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Phone, email and tokenType are required' } };
        }

        const normalizedPhone = normalizePhone(mobile);
        if (!isValidPhone(normalizedPhone) || !isValidEmail(email)) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid phone or email format' } };
        }

        if (!user.permissions.includes('admin')) {
            if (!user.permissions.includes('owner') && !user.permissions.includes('partner')) {
                return { statusCode: 403, body: { status: 'error', error_message: 'Insufficient permission' } };
            }
            if (!user.permissions.includes('owner') && tokenType !== 'merchant') {
                return { statusCode: 403, body: { status: 'error', error_message: 'Only site owners can invite communities or partners' } };
            }
            const targetUrl = url || communityId;
            if ((tokenType === 'community' || tokenType === 'partner') && !targetUrl) {
                return { statusCode: 400, body: { status: 'error', error_message: 'URL is required for this invitation type' } };
            }
            if (tokenType === 'partner') {
                const trafficCheck = await getTrafficAv(decoded.user_id);
                if (!trafficCheck.success) {
                    return { statusCode: 403, body: { status: 'error', error_message: 'All available invites in use.' } };
                }
            }
        }

        // Use passed pool
        const userCheck = await pool.request()
            .input('email', sql.VarChar(255), email)
            .query(`SELECT COUNT(*) AS count FROM Users WHERE email_address = @email`);

        if (userCheck.recordset[0].count > 0) {
            return { statusCode: 409, body: { status: 'error', error_message: 'The email address is already in use.' } };
        }

        await pool.request()
            .input('email', sql.VarChar(255), email)
            .query(`DELETE FROM Tokens WHERE issued_at < DATEADD(HOUR, -48, GETDATE())`);

        const tokenCheck = await pool.request()
            .input('email', sql.VarChar(255), email)
            .query(`SELECT COUNT(*) AS count FROM Tokens WHERE email = @email AND issued_at > DATEADD(HOUR, -48, GETDATE())`);

        if (tokenCheck.recordset[0].count > 0) {
            return { statusCode: 409, body: { status: 'error', error_message: 'The email address has a pending invite.' } };
        }

        const affiliateCode = await originCode(event);
        const signup_url = event.headers.origin || 'https://greenfieldsites.clubmadeira.io';

        const pin = generatePin();
        const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        const tokenPayload = { referrerId: user.user_id, expiry };

        let onboardingToken;
        try {
            onboardingToken = await signJWT(tokenPayload);
        } catch (err) {
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to generate onboarding token' } };
        }

        const emailResult = await sendEmail(email, onboardingToken, normalizedPhone, signup_url, tokenType, url);
        if (!emailResult.success) {
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to send email' } };
        }

        const smsMessage = `Your onboarding PIN is ${pin}. It expires in 48 hours.`;
        const smsSuccess = await sendSmsTextmagic(normalizedPhone, smsMessage);
        if (!smsSuccess) {
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to send PIN' } };
        }

        const currentDate = new Date();
        await pool.request()
            .input('token_id', sql.VarChar(512), onboardingToken)
            .input('pin', sql.VarChar(6), pin)
            .input('phone', sql.VarChar(15), normalizedPhone)
            .input('email', sql.VarChar(255), email)
            .input('referrer_by', sql.Char(8), decoded.user_id)
            .input('issued_at', sql.DateTime, currentDate)
            .input('created_at', sql.DateTime, currentDate)
            .input('tokenType', sql.VarChar(50), tokenType)
            .input('signupurl', sql.VarChar(255), signup_url)
            .input('origin_code', sql.VarChar, affiliateCode)
            .input('url', sql.VarChar, url || communityId || null)
            .query(`
                INSERT INTO Tokens 
                (token_id, pin, phone, email, referrer_by, issued_at, created_at, validated, tokenType, signup_url, origin_code, url)
                VALUES 
                (@token_id, @pin, @phone, @email, @referrer_by, @issued_at, @created_at, 0, @tokenType, @signupurl, @origin_code, @url)
            `);

        if (sandbox) logger.debug('[SANDBOX] Onboarding token generated', { email, tokenType });

        logger.info('Onboarding token generated successfully', { email, tokenType, targetUrl: url || communityId });

        return { statusCode: 200, body: { status: 'success', message: 'Onboarding token generated successfully' } };
    }

    // ==================== validate (FULL) ====================
    if (action === 'validate') {
        const requestId = event.requestContext?.requestId || 'unknown';
        const { token: onboardingToken, pin } = body;

        if (!onboardingToken || !pin) {
            logger.warn('Missing token or PIN', { requestId });
            return { statusCode: 400, body: { status: 'error', error_message: 'Token and PIN are required' } };
        }

        let payload;
        try {
            payload = await verifyJWT(onboardingToken);
            logger.debug('Onboarding token verified', { requestId, referrerId: payload.referrerId });
        } catch (error) {
            logger.warn('Invalid or malformed onboarding token', { requestId, error: error.message });
            return { statusCode: 401, body: { status: 'error', error_message: 'Invalid or malformed token' } };
        }

        if (new Date() > new Date(payload.expiry)) {
            logger.warn('Token has expired', { requestId, expiry: payload.expiry });
            return { statusCode: 401, body: { status: 'error', error_message: 'Token has expired' } };
        }

        const referrer = await getUserById(payload.referrerId, event);
        if (!referrer || (!referrer.permissions.includes('admin') && !referrer.permissions.includes('partner'))) {
            logger.warn('Invalid or unauthorized referrer', { requestId, referrerId: payload.referrerId });
            return { statusCode: 403, body: { status: 'error', error_message: 'Invalid or unauthorized referrer' } };
        }

        const tokenDataResult = await pool.request()
            .input('token_id', sql.VarChar(512), onboardingToken)
            .query('SELECT pin, validated, signup_url, stripe_account_id FROM Tokens WHERE token_id = @token_id');

        if (tokenDataResult.recordset.length === 0) {
            logger.warn('Token not found', { requestId });
            return { statusCode: 404, body: { status: 'error', error_message: 'Token not found' } };
        }

        const tokenData = tokenDataResult.recordset[0];

        if (tokenData.pin !== pin) {
            logger.warn('Invalid PIN', { requestId });
            return { statusCode: 401, body: { status: 'error', error_message: 'Invalid PIN' } };
        }

        let stripe;
        try {
            stripe = await getStripeClient(event);
        } catch (error) {
            logger.error('Failed to get Stripe client', { requestId, error: error.message });
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to initialize Stripe' } };
        }

        const return_url = `https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/login/onboarding?token=${onboardingToken}`;
        const refreshUrl = new URL(tokenData.signup_url);
        refreshUrl.searchParams.append('signup', 'fail');
        const refresh_url = refreshUrl.toString();

        let account_link;
        try {
            account_link = await stripe.accountLinks.create({
                account: tokenData.stripe_account_id,
                refresh_url: refresh_url,
                return_url: return_url,
                type: 'account_onboarding'
            });
            logger.info('Stripe account link created', { requestId, accountId: tokenData.stripe_account_id });
        } catch (error) {
            logger.error('Failed to create Stripe account link', { requestId, error: error.message });
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to create Stripe account link' } };
        }

        return {
            statusCode: 200,
            body: { status: 'success', account_link: account_link.url }
        };
    }

    // ==================== complete (FULL) ====================
    if (action === 'complete') {
        const queryToken = query.token;
        if (!queryToken) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Token is required' } };
        }

        if (sandbox) logger.debug('[SANDBOX] Starting complete onboarding', { token: queryToken });

        const onboardingDataResult = await pool.request()
            .input('token_id', sql.VarChar, queryToken)
            .query('SELECT * FROM Tokens WHERE token_id = @token_id');

        const onboardingData = onboardingDataResult.recordset[0];
        if (!onboardingData) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid token' } };
        }

        const issuedAt = new Date(onboardingData.issued_at);
        if (Date.now() > issuedAt.getTime() + (48 * 60 * 60 * 1000)) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Token expired' } };
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

        const isSandboxStripe = stripe.isSandbox;
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

        if (role === 'community' && !userData.first_name && logEmail) userData.first_name = logEmail.split('@')[0];
        if (role === 'merchant' && !userData.company_name && logEmail) userData.company_name = logEmail.split('@')[0];

        await createUser(userData);
        logger.info('User created from onboarding', { userId, role, email: logEmail });

        if (role === 'partner' && onboardingData.url) {
            await pool.request()
                .input('user_id', sql.VarChar, userId)
                .input('signupurl', sql.VarChar, onboardingData.url)
                .query('UPDATE Users SET signupurl = @signupurl WHERE user_id = @user_id');
        }

        await capturePostHogEvent(userId, 'signup', {
            user_id: userId,
            role,
            affiliate_code: onboardingData.referrer_by
        });

        if (role === 'community' && onboardingData.url) {
            try {
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

                await enqueueMessage({ type: 'CLUBSCAN_FETCH_CONTENT', url: onboardingData.url });
                logger.info('ClubScan pipeline started via SQS', { userId, url: onboardingData.url });
            } catch (err) {
                logger.error('Failed to start ClubScan pipeline', { userId, url: onboardingData.url, error: err.message });
            }
        }

        if (role === 'partner' && onboardingData.url) {
            await sendCPOnboardedEmail(logEmail, onboardingData.url, userId);
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
            isSandboxStripe,
            'This is your first login.'
        );

        await pool.request()
            .input('token_id', sql.VarChar, queryToken)
            .query('DELETE FROM Tokens WHERE token_id = @token_id');

        if (sandbox) logger.debug('[SANDBOX] Onboarding complete', { userId, role });

        return { statusCode: 302, headers: { Location: redirectUrl }, body: '' };
    }

    // ==================== complete-signup ====================
    if (action === 'complete-signup') {
        if (sandbox) logger.debug('[SANDBOX] complete-signup called');
        return { statusCode: 200, body: { status: 'success', token: body.authToken || '', user_id: '', contact_name: '', workflow: 'login' } };
    }

    return { statusCode: 400, body: { status: 'error', error_message: 'Invalid action' } };
};