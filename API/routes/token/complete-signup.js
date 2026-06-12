// ====================== routes/token/complete-signup.js ======================
const { logger } = require('/opt/nodejs/helpers');
const { verifyJWT } = require('/opt/nodejs/jwt');

const { 
    getUserById, 
    isValidPassword, 
    isValidEmail, 
    isValidPhone, 
    updateUser, 
    getLastLogin 
} = require('./helpers');

module.exports = async (event, { pool, sandbox = false } = {}) => {
    const body = event.body ? JSON.parse(event.body) : {};

    if (!body.signup_url) {
        return { statusCode: 400, body: { status: 'error', message: 'signup_url is required' } };
    }

    let decoded;
    try {
        const token = body.authToken;
        if (!token) throw new Error('No auth token');
        decoded = await verifyJWT(token);
    } catch (err) {
        return { statusCode: 200, body: { status: 'error', error_message: 'Invalid token' } };
    }

    const userId = decoded.user_id;
    const user = await getUserById(userId, event);
    if (!user) {
        return { statusCode: 200, body: { status: 'error', error_message: 'User not found' } };
    }

    const { password, confirm_password, email, phone } = body;

    if (!password || !confirm_password) {
        return { statusCode: 200, body: { status: 'error', error_message: 'Password and confirm_password are required' } };
    }

    if (password !== confirm_password) {
        return { statusCode: 200, body: { status: 'error', error_message: 'Passwords do not match' } };
    }

    if (!isValidPassword(password)) {
        return { statusCode: 200, body: { status: 'error', error_message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' } };
    }

    let updateEmail = null;
    if (email) {
        if (!isValidEmail(email)) {
            return { statusCode: 200, body: { status: 'error', error_message: 'Invalid email format' } };
        }
        updateEmail = email;
    }

    let updatePhone = null;
    if (phone) {
        if (!isValidPhone(phone)) {
            return { statusCode: 200, body: { status: 'error', error_message: 'Phone must be in +44xxxxxxxxxx format' } };
        }
        updatePhone = phone;
    }

    await updateUser(userId, password, updateEmail, updatePhone);

    const contactName = user.company_name || user.first_name || userId;
    const lastLogin = await getLastLogin(userId);

    let lastLoginMessage;
    if (lastLogin) {
        const loginTime = new Date(lastLogin.timestamp);
        const formattedTime = loginTime.toLocaleString('en-GB', {
            hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        lastLoginMessage = `You last logged in at ${formattedTime} from ${lastLogin.IP}.`;
    }

    const responseBody = {
        status: 'success',
        token: body.authToken,
        user_id: userId,
        contact_name: contactName,
        workflow: 'login'
    };

    if (lastLoginMessage) responseBody.lastlogin = lastLoginMessage;

    if (sandbox) logger.debug('[SANDBOX] complete-signup executed', { userId });

    return { statusCode: 200, body: responseBody };
};