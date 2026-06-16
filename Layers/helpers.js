// helpers.js - SSM Parameter Store version (single authoritative source)
const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const winston = require('winston');
const { PostHog } = require('posthog-node');
const querystring = require('querystring');
const crypto = require('crypto');

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
// Configure Winston logger (from second)
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()],
    defaultMeta: { service: 'madeira-token-lambda' }
});
// TextMagic configuration (from second)
const TEXTMAGIC = {
    API_URL: process.env.TEXTMAGIC_URL || 'https://rest.textmagic.com/api/v2/messages',
    USERNAME: process.env.TEXTMAGIC_USERNAME,
    API_KEY: process.env.TEXTMAGIC_API_KEY
};
// Validate Token
async function validateJwt(event) {
    const startTime = Date.now();
    const transactionId = `jwt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
   
    try {
        const jwtPayload = {
            headers: event.headers
        };
       
        const lambdaClient = new LambdaClient();
        const command = new InvokeCommand({
            FunctionName: "madeira-jwt",
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(jwtPayload)
        });
       
        logger.debug('Invoking JWT Lambda', {
            transactionId,
            functionName: "madeira-jwt"
        });
       
        const response = await lambdaClient.send(command);
   
        if (response.FunctionError) {
            const errorPayload = new TextDecoder().decode(response.Payload);
            logger.error('JWT Lambda invocation failed with function error', {
                transactionId,
                functionError: response.FunctionError,
                payload: errorPayload
            });
            throw new Error('JWT validation failed');
        }
               
        const duration = Date.now() - startTime;
        logger.info('JWT validation successful', { transactionId, durationMs: duration });
               
        return JSON.parse(new TextDecoder().decode(response.Payload)).payload ;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('JWT validation failed', {
            transactionId,
            error: error.message,
            stack: error.stack,
            durationMs: duration
        });
        throw error;
    }
}
// New helper for signing
async function signJwt(payload) {
    const startTime = Date.now();
    const transactionId = `jwt-sign-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
   
    try {
        const jwtPayload = {
            action: 'sign',
            payload
        };
       
        const lambdaClient = new LambdaClient();
        const command = new InvokeCommand({
            FunctionName: "madeira-jwt",
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(jwtPayload)
        });
       
        logger.debug('Invoking JWT Lambda for signing', {
            transactionId,
            functionName: "madeira-jwt"
        });
       
        const response = await lambdaClient.send(command);
        if (response.FunctionError) {
            const errorPayload = new TextDecoder().decode(response.Payload);
            logger.error('JWT Lambda signing failed with function error', {
                transactionId,
                functionError: response.FunctionError,
                payload: errorPayload
            });
            throw new Error('JWT signing failed');
        }
       
        const body = JSON.parse(new TextDecoder().decode(response.Payload));
       
        const duration = Date.now() - startTime;
        logger.info('JWT signing successful', { transactionId, durationMs: duration });
        // ────────────────────────────────────────────────
        // FIXED: Return the actual JWT string, not the whole object
        // ────────────────────────────────────────────────
        if (!body || typeof body.token !== 'string') {
            logger.error('JWT Lambda response missing or invalid token field', {
                transactionId,
                responseBody: body
            });
            throw new Error('Invalid JWT response from Lambda');
        }
        return body.token; // ← return string "eyJhbGciOi..."
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('JWT signing failed', {
            transactionId,
            error: error.message,
            stack: error.stack,
            durationMs: duration
        });
        throw error;
    }
}
// New helper for verification
async function verifyJwt(token) {
    const startTime = Date.now();
    const transactionId = `jwt-verify-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
   
    try {
        const jwtPayload = {
            action: 'verify',
            token
        };
       
        const lambdaClient = new LambdaClient();
        const command = new InvokeCommand({
            FunctionName: "madeira-jwt",
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(jwtPayload)
        });
       
        logger.debug('Invoking JWT Lambda for verification', {
            transactionId,
            functionName: "madeira-jwt"
        });
       
        const response = await lambdaClient.send(command);
       
        if (response.FunctionError) {
            const errorPayload = new TextDecoder().decode(response.Payload);
            logger.error('JWT Lambda verification failed with function error', {
                transactionId,
                functionError: response.FunctionError,
                payload: errorPayload
            });
            throw new Error('JWT verification failed');
        }
       
        const body = JSON.parse(new TextDecoder().decode(response.Payload));
       
        const duration = Date.now() - startTime;
        logger.info('JWT verification successful', { transactionId, durationMs: duration });
       
        return body.payload;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('JWT verification failed', {
            transactionId,
            error: error.message,
            stack: error.stack,
            durationMs: duration
        });
        throw error;
    }
}
// Initialize PostHog client (from second)
const posthogClient = process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST
    ? new PostHog(process.env.POSTHOG_API_KEY, {
        host: process.env.POSTHOG_HOST,
        flushAt: 1, // Flush after every single event
        flushInterval: 0 // Disable timed flushing
    })
    : null;
    if (posthogClient) {
        posthogClient.on('error', (err) => {
            logger.error('PostHog send error', { error: err.message, stack: err.stack });
        });
    }
// ====================== SSM PARAMETER STORE DB CONFIG (NEW) ======================
let dbConfigCache = null;
let dbConfigCacheTime = 0;

async function getDbConfig() {
    const now = Date.now();

    // Use cache if still fresh (30 minutes)
    if (dbConfigCache && (now - dbConfigCacheTime < 1800000)) {
        logger.debug('✅ Using cached DB config from SSM');
        return dbConfigCache;
    }

    logger.info('🔄 Fetching DB config from SSM Parameter Store');

    try {
        const client = new SSMClient({ region: "eu-west-2" });

        const command = new GetParametersCommand({
            Names: [
                '/madeira/db/user',
                '/madeira/db/password',
                '/madeira/db/server',
                '/madeira/db/name'
            ],
            WithDecryption: true
        });

        const response = await client.send(command);

        const config = {};
        response.Parameters.forEach(param => {
            const key = param.Name.split('/').pop(); // user, password, server, name
            config[key] = param.Value;
        });

        // Cache it
        dbConfigCache = config;
        dbConfigCacheTime = now;

        logger.info('✅ DB config successfully loaded from SSM Parameter Store');
        return config;

    } catch (error) {
        logger.error('Failed to fetch DB config from SSM', { error: error.message });
        throw new Error(`SSM Parameter Store failed: ${error.message}`);
    }
}
// Database (used across all routes: getDbConnection)
async function getDbConnection() {
    try {
        const config = await getDbConfig();

        const pool = await sql.connect({
            user: config.user,
            password: config.password,
            server: config.server,
            database: config.name,
            options: {
                encrypt: true,
                trustServerCertificate: true,
                requestTimeout: 300000 // 5 minutes timeout
            }
        });
        logger.debug('Database connection established');
        return pool;
    } catch (error) {
        logger.error('Database connection failed', { error: error.message, stack: error.stack });
        throw new Error(`Database connection failed: ${error.message}`);
    }
}
async function addToClubScan(url, PartnerId, ClubId) {
    const pool = await getDbConnection();
    try {
        // Insert pending record if not exists, including owner
        await pool.request()
            .input('url', sql.NVarChar, url)
            .input('PartnerId', sql.VarChar, PartnerId) // Assuming owner is a string, adjust type if needed
            .input('ClubId', sql.VarChar, ClubId) // Assuming owner is a string, adjust type if needed
            .query(`
                MERGE INTO clubscan AS target
                USING (VALUES (@url)) AS source (Url)
                ON target.Url = source.Url
                WHEN NOT MATCHED THEN
                    INSERT (Url, Status, PartnerId , ClubId) VALUES (@url, 'pending', @PartnerId , @ClubId);
            `);
        // Invoke processor Lambda asynchronously
        const payload = JSON.stringify({ url });
        const command = new InvokeCommand({
            FunctionName: "madeira-clubscan",
            InvocationType: 'Event',
            Payload: payload
        });
        await lambdaClient.send(command);
    } finally {
        pool.close();
    }
}
// General Utilities (used across routes: normalizePath, parseBody, getCookieFromRequest)
function normalizePath(path) {
    if (!path) return '/unknown';
    return '/' + path.trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}
function parseBody(event, requestId) {
    const contentType = (event.headers?.['Content-Type'] || event.headers?.['content-type'] || '').toLowerCase();
    let body;
    if (contentType.includes('application/json')) {
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            logger.warn('Invalid JSON in request body', { requestId, error: err.message });
            return null;
        }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
        body = querystring.parse(event.body || '');
    } else if (contentType) {
        logger.warn('Unsupported Content-Type', { requestId, contentType });
        return null;
    } else {
        logger.warn('Missing Content-Type for POST request', { requestId });
        return null;
    }
    return body;
}
function getCookieFromRequest(event, cookieName) {
    const cookieHeader = event.headers?.cookie || '';
    const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
    for (const cookie of cookies) {
        const [name, value] = cookie.split('=');
        if (name === cookieName) {
            return value;
        }
    }
    return null;
}
// Authentication and Validation (used in login, reset-password, verify-reset-code: isValidPassword, generateToken, isValidEmail, isValidPhone, updateUserPassword, updateUser)
function isValidPassword(password) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&=`~#^-_+[\]{}|;:,./<>])[A-Za-z\d@$!%*?&=`~#^-_+[\]{}|;:,./<>]{8,}$/;
    return regex.test(password);
}
function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}
function isValidPhone(phone) {
    const regex = /^\+44\d{10}$/;
    return regex.test(phone);
}
async function updateUserPassword(userId, hashedPassword) {
    const pool = await getDbConnection();
    try {
        await pool.request()
            .input('user_id', sql.VarChar, userId)
            .input('password', sql.VarChar, hashedPassword)
            .query('UPDATE Users SET password = @password, updated_at = GETDATE() WHERE user_id = @user_id');
        logger.info('Updated user password', { userId });
    } catch (error) {
        logger.error('Failed to update password', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
        logger.debug('Database connection closed');
    }
}
async function updateUser(userId, password, email, phone) {
    const pool = await getDbConnection();
    try {
        let query = 'UPDATE Users SET updated_at = GETDATE()';
        const inputs = [];
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = @password';
            inputs.push({ name: 'password', type: sql.VarChar, value: hashedPassword });
        }
        if (email) {
            query += ', email_address = @email';
            inputs.push({ name: 'email', type: sql.VarChar, value: email });
        }
        if (phone) {
            query += ', phone_number = @phone';
            inputs.push({ name: 'phone', type: sql.VarChar, value: phone });
        }
        query += ' WHERE user_id = @user_id';
        inputs.push({ name: 'user_id', type: sql.VarChar, value: userId });
        const request = pool.request();
        inputs.forEach(input => {
            request.input(input.name, input.type, input.value);
        });
        await request.query(query);
        logger.info('Updated user', { userId, updatedFields: { password: !!password, email: !!email, phone: !!phone } });
    } catch (error) {
        logger.error('Failed to update user', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}
// User Creation and Retrieval (used in onboarding, complete-signup: generateUserId, isUserIdUnique, createUser, getUserByEmail, getUserById, getLastLogin, verifyAffiliate)
function generateUserId() {
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 7; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        code += charset[randomIndex];
    }
    let total = 0;
    for (let char of code) {
        total += charset.indexOf(char);
    }
    const checksum = charset[total % 36];
    return code + checksum;
}
async function isUserIdUnique(userId) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('user_id', sql.VarChar, userId)
            .query('SELECT COUNT(*) as count FROM Users WHERE user_id = @user_id');
        return result.recordset[0].count === 0;
    } catch (error) {
        logger.error('Failed to check user_id uniqueness', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}
async function createUser(userData) {
    const pool = await getDbConnection();
    try {
        const emailAddress = userData.email_address;
        // Check if the email already exists
        const emailCheck = await pool.request()
            .input('email_address', sql.VarChar, emailAddress)
            .query('SELECT COUNT(*) as count FROM Users WHERE email_address = @email_address');
        if (emailCheck.recordset[0].count > 0) {
            logger.warn('Email already exists', { emailAddress });
            throw new Error('Email address is already in use');
        }
        // Validate that required name fields are present based on role
        if (userData.role === 'community' && !userData.first_name) {
            throw new Error('first_name is required for community role');
        } else if (userData.role === 'merchant' && !userData.company_name) {
            throw new Error('company_name is required for merchant role');
        }
        // Insert the new user
        const permissions = JSON.stringify(userData.permissions || []);
        const result = await pool.request()
            .input('user_id', sql.VarChar, userData.user_id)
            .input('email_address', sql.VarChar, emailAddress)
            .input('first_name', sql.VarChar, userData.first_name || null)
            .input('last_name', sql.VarChar, userData.last_name || null)
            .input('phone_number', sql.VarChar, userData.phone_number || null)
            .input('permissions', sql.VarChar, permissions)
            .input('stripe_account_id', sql.VarChar, userData.stripe_account_id || null)
            .input('role', sql.VarChar, userData.role || null)
            .input('company_name', sql.VarChar, userData.company_name || null)
            .input('tax_id', sql.VarChar, userData.tax_id || null)
            .input('address', sql.VarChar, userData.address ? JSON.stringify(userData.address) : null)
            .input('dob', sql.VarChar, userData.dob || null)
            .input('ssn_last_4', sql.VarChar, userData.ssn_last_4 || null)
            .input('referrer', sql.VarChar, userData.referrer || null)
            .query(`
                INSERT INTO Users (
                    user_id, email_address, first_name, last_name, phone_number,
                    permissions, stripe_account_id, role, company_name, tax_id, address,
                    dob, ssn_last_4, referrer, created_at, updated_at
                )
                VALUES (
                    @user_id, @email_address, @first_name, @last_name, @phone_number,
                    @permissions, @stripe_account_id, @role, @company_name, @tax_id, @address,
                    @dob, @ssn_last_4, @referrer, GETDATE(), GETDATE()
                )
            `);
        logger.info('Created new user', {
            userId: userData.user_id,
            email: emailAddress,
            role: userData.role,
            permissions,
            referrer: userData.referrer,
            hasPassword: false,
            phone: userData.phone_number
        });
        return userData.user_id;
    } catch (error) {
        logger.error('Failed to create user', { error: error.message });
        throw error;
    } finally {
        pool.close();
        logger.debug('Database connection closed');
    }
}
async function getUserByEmail(email) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('email', sql.VarChar, email.toLowerCase())
            .query('SELECT user_id, email_address, password, first_name, phone_number, permissions, role, company_name FROM Users WHERE email_address = @email');
        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            user.permissions = JSON.parse(user.permissions || '[]');
            logger.debug('Retrieved user', { email, userId: user.user_id });
            return user;
        }
        logger.debug('No user found', { email });
        return null;
    } catch (error) {
        logger.error('Failed to retrieve user', { email, error: error.message });
        throw error;
    } finally {
        pool.close();
        logger.debug('Database connection closed');
    }
}
async function getUserById(userId, event) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('user_id', sql.VarChar, userId)
            .query('SELECT user_id, email_address, password, first_name, phone_number, permissions, role, company_name FROM Users WHERE user_id = @user_id');
        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            let permissions = JSON.parse(user.permissions || '[]');
            logger.debug('Retrieved user', { userId });
            // Fetch originCode and check if user_id matches to add 'owner' role
            try {
                const code = await originCode(event);
                if (user.user_id === code && permissions.includes('partner')) {
                    permissions.push('owner');
                    logger.info('Added "owner" role based on originCode match', { userId: user.user_id, originCode: code });
                }
            } catch (error) {
                // Log error but proceed without adding the role
                logger.warn('Failed to fetch or match originCode, skipping "owner" role addition', { error: error.message });
            }
            user.permissions = permissions;
            return user;
        }
        logger.debug('No user found', { userId });
        return null;
    } catch (error) {
        logger.error('Failed to retrieve user', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
        logger.debug('Database connection closed');
    }
}
async function verifyAffiliate(affiliateCode) {
    const pool = await getDbConnection();
    try {
        const userResult = await pool.request()
            .input('user_id', sql.VarChar, affiliateCode)
            .query('SELECT permissions FROM Users WHERE user_id = @user_id');
        if (userResult.recordset.length === 0) {
            return { valid: false, reason: 'Invalid affiliate code' };
        }
        const permissions = JSON.parse(userResult.recordset[0].permissions || '[]');
        if (!permissions.includes('partner')) {
            return { valid: false, reason: 'Affiliate does not have partner role' };
        }
        return { valid: true };
    } catch (error) {
        logger.error('Failed to verify affiliate', { affiliateCode, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}
async function getLastLogin(userId) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('user_id', sql.VarChar, userId)
            .query(`
                SELECT TOP 1 [IP], [timestamp]
                FROM [madeiradb].[dbo].[PostHogEvents]
                WHERE [source] = @user_id AND [eventtype] = 'login'
                ORDER BY [timestamp] DESC
            `);
        if (result.recordset.length > 0) {
            const { IP, timestamp } = result.recordset[0];
            return { IP, timestamp };
        }
        return null;
    } catch (error) {
        logger.error('Failed to retrieve last login', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}
async function setLastLogin(userId, IP) {
    const pool = await getDbConnection();
    try {
        await pool.request()
            .input('eventtype', sql.VarChar, 'login')
            .input('source', sql.VarChar, userId)
            .input('IP', sql.VarChar, IP)
            .input('timestamp', sql.DateTime, new Date())
            .query(`
                INSERT INTO [madeiradb].[dbo].[PostHogEvents] (eventtype, source, IP, timestamp)
                VALUES (@eventtype, @source, @IP, @timestamp)
            `);
    } catch (error) {
        logger.error('Failed to set last login', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}
async function getStripeClient(event) {
    const origin = event.headers.origin;
    if (!origin) {
        logger.error('No origin header found');
        throw new Error('No origin header found');
    }
    const url = `${origin}/index.json`;
    try {
        const response = await axios.get(url);
        if (response.status !== 200) {
            logger.error('Failed to fetch index.json', { url, status: response.status });
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        const data = response.data;
        const sandbox = data.sandbox === true;
        // Now invoke Lambda for stripe key
        const payload = { action: "stripe_key", sandbox };
        const lambdaClient = new LambdaClient();
        const command = new InvokeCommand({
            FunctionName: "madeira-stripe",
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(payload)
        });
        const lambdaResponse = await lambdaClient.send(command);
       
        if (lambdaResponse.FunctionError) {
            const errorPayload = new TextDecoder().decode(lambdaResponse.Payload);
            logger.error('Stripe key Lambda invocation failed', { error: errorPayload });
            throw new Error('Failed to fetch Stripe key');
        }
       
        const body = JSON.parse(new TextDecoder().decode(lambdaResponse.Payload));
        const stripeKey = body.stripeKey;
       
        logger.debug('Using Stripe key', { sandbox, keyPreview: stripeKey.substring(0, 8) + '...' });
        return require('stripe')(stripeKey);
    } catch (error) {
        logger.error('Error in getStripeClient', { url, error: error.message });
        throw error;
    }
}
async function purchaseMarketingReport(resellerId, url, event) {
    const origin = event.headers.origin;
    if (!origin) {
        logger.error('No origin header found');
        throw new Error('No origin header found');
    }
    const indexUrl = `${origin}/index.json`;
    let sandbox;
    try {
        const response = await axios.get(indexUrl);
        if (response.status !== 200) {
            logger.error('Failed to fetch index.json', { url: indexUrl, status: response.status });
            throw new Error(`Failed to fetch ${indexUrl}: ${response.status}`);
        }
        const data = response.data;
        sandbox = data.sandbox === true;
        logger.debug(sandbox ? 'Using sandbox mode' : 'Using live mode', { url: indexUrl });
    } catch (error) {
        logger.error('Error fetching index.json for sandbox determination', { url: indexUrl, error: error.message });
        throw error;
    }
    const payload = {
        action: "purchaseMarketingReport",
        resellerId,
        url,
        sandbox
    };
    const command = new InvokeCommand({
        FunctionName: "madeira-stripe",
        Payload: JSON.stringify(payload)
    });
    try {
        const response = await lambdaClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.Payload));
        if (response.FunctionError) {
            throw new Error(`Lambda invocation error: ${responseBody.errorMessage}`);
        }
        return responseBody;
    } catch (error) {
        logger.error('Error invoking Stripe Lambda', { error: error.message });
        throw error;
    }
}
async function processCommissionPayment(merchantId, communityId, totalSaleAmount, sandbox) {
   
    const payload = {
        action: "commission",
        merchantId,
        communityId,
        totalSaleAmount,
        sandbox
    };
    const command = new InvokeCommand({
        FunctionName: "madeira-stripe",
        InvocationType: 'Event', // Changed to 'Event' for asynchronous invocation
        Payload: JSON.stringify(payload)
    });
    try {
        await lambdaClient.send(command);
        logger.info('Asynchronous invocation of Stripe Lambda initiated');
        return { statusCode: 202, body: JSON.stringify({ message: 'Payment processing started asynchronously' }) };
    } catch (error) {
        logger.error('Error invoking Stripe Lambda asynchronously', { error: error.message });
        throw error;
    }
}
async function confirmOnboarding(merchantId, resellerId, event) {
    const origin = event.headers.origin;
    if (!origin) {
        logger.error('No origin header found');
        throw new Error('No origin header found');
    }
    const indexUrl = `${origin}/index.json`;
    let sandbox;
    try {
        const response = await axios.get(indexUrl);
        if (response.status !== 200) {
            logger.error('Failed to fetch index.json', { url: indexUrl, status: response.status });
            throw new Error(`Failed to fetch ${indexUrl}: ${response.status}`);
        }
        const data = response.data;
        sandbox = data.sandbox === true;
        logger.debug(sandbox ? 'Using sandbox mode' : 'Using live mode', { url: indexUrl });
    } catch (error) {
        logger.error('Error fetching index.json for sandbox determination', { url: indexUrl, error: error.message });
        throw error;
    }
    const payload = {
        action: "confirmOnboarding",
        merchantId,
        resellerId,
        sandbox
    };
    const command = new InvokeCommand({
        FunctionName: "madeira-stripe",
        Payload: JSON.stringify(payload)
    });
    try {
        const response = await lambdaClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.Payload));
        if (response.FunctionError) {
            throw new Error(`Lambda invocation error: ${responseBody.errorMessage}`);
        }
        return responseBody;
    } catch (error) {
        logger.error('Error invoking Stripe Lambda', { error: error.message });
        throw error;
    }
}
async function originCode(event) {
    const origin = event.headers.origin;
    if (!origin) {
        logger.error('No origin header found');
        throw new Error('No origin header found');
    }
    const url = `${origin}/index.json`;
    try {
        const response = await axios.get(url);
        if (response.status !== 200) {
            logger.error('Failed to fetch index.json', { url, status: response.status });
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        const data = response.data;
        if (!data.affiliateCode) {
            logger.error('affiliateCode not found in index.json', { url });
            throw new Error('affiliateCode not found');
        }
        logger.debug('Fetched affiliateCode', { url, affiliateCode: data.affiliateCode });
        return data.affiliateCode;
    } catch (error) {
        logger.error('Error fetching index.json', { url, error: error.message });
        throw error;
    }
}
// Communication (used in onboarding: sendSmsTextmagic, sendEmail, normalizePhone)
const normalizePhone = (phone) => {
    let normalized = phone.replace(/\s/g, '');
    if (normalized.startsWith('0')) {
        normalized = '+44' + normalized.slice(1);
    } else if (!normalized.startsWith('+')) {
        normalized = '+44' + normalized;
    }
    logger.debug('Normalized phone number', { original: phone, normalized });
    return normalized;
};
async function sendSmsTextmagic(toNumber, message) {
    try {
        let normalizedNumber = toNumber.replace(/\s/g, '');
        if (normalizedNumber.startsWith('0')) {
            normalizedNumber = '+44' + normalizedNumber.slice(1);
        } else if (!normalizedNumber.startsWith('+')) {
            normalizedNumber = '+44' + normalizedNumber;
        }
        const response = await axios.post(
            TEXTMAGIC.API_URL,
            {
                text: message,
                phones: normalizedNumber
            },
            {
                headers: {
                    'X-TM-Username': TEXTMAGIC.USERNAME,
                    'X-TM-Key': TEXTMAGIC.API_KEY
                }
            }
        );
        if (response.status === 201) {
            logger.info('SMS sent successfully via TextMagic', { toNumber: normalizedNumber, response: response.data });
            return true;
        } else {
            logger.error('Failed to send SMS via TextMagic', { toNumber: normalizedNumber, status: response.status, error: response.data });
            return false;
        }
    } catch (error) {
        logger.error('Error sending SMS via TextMagic', { toNumber, error: error.message });
        return false;
    }
}
// URL and Redirect Helpers (used in onboarding, complete-signup: buildRedirectUrl, buildSetTokenUrl, buildSuccessRedirectUrl)
function buildRedirectUrl(baseUrl, status, reason = null) {
    const url = new URL(baseUrl);
    url.searchParams.set('signup', status);
    if (reason) {
        url.searchParams.set('reason', reason);
    }
    return url.toString();
}
function buildSetTokenUrl(signupUrl, token, userId, contactName, workflow, isSandbox = false, lastLoginMessage = null) {
    const origin = new URL(signupUrl).origin;
    const workflowParam = workflow === 'login' ? 'dashboard' : 'signup';
    const params = new URLSearchParams();
    params.append(workflowParam, '');
    params.append('authToken', token);
    params.append('user_id', userId);
    params.append('contact_name', contactName);
    if (lastLoginMessage) {
        params.append('lastlogin', lastLoginMessage);
    }
    if (isSandbox) {
        params.append('sandbox', 'true');
    }
    return `${origin}/set-token.html?${params.toString()}`;
}
function buildSuccessRedirectUrl(baseUrl, isSandbox) {
    const url = new URL(baseUrl);
    url.searchParams.set('signup', 'ok');
    if (isSandbox) {
        url.searchParams.set('sandbox', 'true');
    }
    return url.toString();
}
// Analytics (used in onboarding, login: capturePostHogEvent)
async function capturePostHogEvent(distinctId, eventName, properties) {
    if (posthogClient) {
        try {
            posthogClient.capture({
                distinctId,
                event: eventName,
                properties,
            });
            await posthogClient.shutdown();
            logger.debug(`PostHog ${eventName} event captured`, { distinctId, properties });
        } catch (posthogError) {
            logger.error(`Failed to capture PostHog ${eventName} event`, {
                distinctId,
                error: posthogError.message
            });
        }
    } else {
        logger.debug('PostHog not configured, skipping event', { distinctId, eventName });
    }
}
// PIN Generation (used in addRole or generateOnboardingToken)
const generatePin = () => {
    const pin = crypto.randomInt(100000, 999999).toString();
    logger.debug('Generated PIN', { pin });
    return pin;
};
async function getTrafficAv(userId) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('userId', sql.VarChar, userId)
            .query('SELECT dbo.TrafficAv(@userId) AS available_licenses');
        const available = result.recordset[0].available_licenses || 0;
        logger.debug('Retrieved available licenses', { userId, available });
        return { success: available > 0 };
    } catch (error) {
        logger.error('Failed to retrieve traffic average', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
        logger.debug('Database connection closed');
    }
}
async function getSignupUrlByUserId(userId) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('user_id', sql.VarChar, userId)
            .query('SELECT signupurl FROM Users WHERE user_id = @user_id');
        if (result.recordset.length > 0) {
            return result.recordset[0].signupurl;
        }
        return null;
    } catch (error) {
        logger.error('Failed to get signup_url by userId', { userId, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}
async function getPartnerSignupUrlFromClubScan(url, resellerId) {
    const pool = await getDbConnection();
    try {
        const result = await pool.request()
            .input('url', sql.VarChar, url)
            .input('resellerId', sql.VarChar, resellerId)
            .query('SELECT PartnerId FROM clubscan WHERE Url = @url AND ResellerId = @resellerId');
        if (result.recordset.length > 0) {
            const partnerId = result.recordset[0].PartnerId;
            return await getSignupUrlByUserId(partnerId);
        }
        return null;
    } catch (error) {
        logger.error('Failed to get partner signup_url from clubscan', { url, resellerId, error: error.message });
        throw error;
    } finally {
        pool.close();
    }
}
module.exports = {
    addToClubScan,
    logger,
    TEXTMAGIC,
    validateJwt,
    signJwt,
    verifyJwt,
    posthogClient,
    generatePin,
    generateUserId,
    isUserIdUnique,
    getDbConnection,
    getUserByEmail,
    getUserById,
    updateUserPassword,
    createUser,
    sendSmsTextmagic,
    normalizePath,
    buildRedirectUrl,
    getCookieFromRequest,
    isValidPassword,
    isValidEmail,
    isValidPhone,
    updateUser,
    buildSetTokenUrl,
    buildSuccessRedirectUrl,
    verifyAffiliate,
    getLastLogin,
    setLastLogin,
    parseBody,
    capturePostHogEvent,
    normalizePhone,
    bcrypt,
    uuidv4,
    axios,
    sql,
    crypto,
    getTrafficAv,
    originCode,
    getSignupUrlByUserId,
    getPartnerSignupUrlFromClubScan,
    getStripeClient,
    purchaseMarketingReport,
    confirmOnboarding,
    processCommissionPayment
};