// ====================== routes/token/login.js ======================
// CLEAN VERSION - Matches original production login exactly
// Only email + password required. No extra fields.

const { logger, comparePassword } = require('/opt/nodejs/helpers');
const { signJWT } = require('/opt/nodejs/jwt');

const { parseBody } = require('./helpers');

const {
    getUserByEmail,
    getLastLogin,
    setLastLogin
} = require('./helpers');

module.exports = async (event, { pool, sandbox = false } = {}) => {
    const requestId = event.requestContext?.requestId || 'unknown';
    const ipAddress = event.requestContext?.identity?.sourceIp;
    const startTotal = Date.now();

    const body = parseBody(event);

    const { email, password } = body;

    if (!email || !password) {
        logger.warn('Missing email or password', { requestId });
        return { statusCode: 400, body: { status: 'error', error_message: 'Email and password are required' } };
    }

    const user = await getUserByEmail(email, event, pool);
    if (!user) {
        logger.warn('User not found', { requestId, email });
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
    const lastLogin = await getLastLogin(user.user_id, pool);
    let lastLoginMessage;
    if (lastLogin) {
        const loginTime = new Date(lastLogin.timestamp);
        const formattedTime = loginTime.toLocaleString('en-GB', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        lastLoginMessage = `You last logged in at ${formattedTime} from ${lastLogin.IP}.`;
    }

    await setLastLogin(user.user_id, ipAddress, pool);

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