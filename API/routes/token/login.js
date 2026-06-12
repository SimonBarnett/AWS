// ====================== routes/token/login.js ======================
const { logger, comparePassword } = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');

const {
    verifyAffiliate,
    getUserByEmail,
    getLastLogin,
    setLastLogin
} = require('./helpers');

module.exports = async (event, { pool, sandbox = false } = {}) => {
    const requestId = event.requestContext?.requestId || 'unknown';
    const ipAddress = event.requestContext?.identity?.sourceIp;
    const startTotal = Date.now();

    let body;
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
        logger.warn('Invalid JSON body', { requestId });
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid request body' } };
    }

    const { email, password, signup_url, affiliate } = body;

    if (!email || !password || !signup_url || !affiliate) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Missing required fields' } };
    }

    let signupUrl;
    try {
        signupUrl = new URL(signup_url).href;
    } catch (err) {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid signup_url' } };
    }

    const affiliateVerification = await verifyAffiliate(affiliate);
    if (!affiliateVerification.valid) {
        return { statusCode: 400, body: { status: 'error', error_message: affiliateVerification.reason } };
    }

    const user = await getUserByEmail(email, event);
    if (!user) {
        return { statusCode: 401, body: { status: 'error', error_message: 'Invalid credentials' } };
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
        return { statusCode: 401, body: { status: 'error', error_message: 'Invalid credentials' } };
    }

    const payload = {
        user_id: user.user_id,
        permissions: user.permissions,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    };

    let token;
    try {
        token = await signJWT(payload);
    } catch (err) {
        logger.error('Failed to generate JWT', { requestId, error: err.message });
        return { statusCode: 500, body: { status: 'error', error_message: 'Failed to generate authentication token' } };
    }

    const contactName = user.company_name || user.first_name || 'User';
    const lastLogin = await getLastLogin(user.user_id);
    let lastLoginMessage;
    if (lastLogin) {
        const loginTime = new Date(lastLogin.timestamp);
        const formattedTime = loginTime.toLocaleString('en-GB', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        lastLoginMessage = `You last logged in at ${formattedTime} from ${lastLogin.IP}.`;
    }

    await setLastLogin(user.user_id, ipAddress);

    const responseBody = {
        status: 'success',
        token,
        user_id: user.user_id,
        contact_name: contactName,
        workflow: 'login'
    };

    if (lastLoginMessage) responseBody.lastlogin = lastLoginMessage;

    if (sandbox) logger.debug('[SANDBOX] Login successful', { userId: user.user_id });

    logger.info('Login successful', { requestId, userId: user.user_id, durationMs: Date.now() - startTotal });

    return { statusCode: 200, body: responseBody };
};