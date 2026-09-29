// test-lambda/index.js
// FINAL VERSION - Optimized for scheduled self-testing
// Standalone connectivity tests (no external route imports)
// mailer test now sends a real email when "notify" is supplied
// Fixed: uses correct EMAIL_* keys from getMailerConfig()

const { 
    logger, 
    getAwsRegion,
    enqueueMessage,
    hashPassword,
    comparePassword,
    getAwinConfig,
    getAmazonConfig,
    getEbayConfig,
    getIncentiveConfig,
    getSmsConfig,
    getDbConnection,
    getMailerConfig
} = require('/opt/nodejs/helpers');

const { generateUserId, validateUserId } = require('/opt/nodejs/auth-utils');
const { signJWT, verifyJWT } = require('/opt/nodejs/jwt');
const { callGrokStructured } = require('/opt/nodejs/grok');
const { getStripeClient } = require('/opt/nodejs/stripe');

const axios = require('axios');
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    // Support both direct and nested body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || event);
    const testCase = body.test || event.test || event.route || 'health';
    const notifyEmail = body.notify || event.notify || null;

    logger.info('🚀 Test Lambda started', { testCase, notifyEmail });

    // ====================== FULL SCHEDULED SELF-TEST ======================
    if (testCase === "full") {
        const startTime = Date.now();
        const report = {
            test: "full",
            timestamp: new Date().toISOString(),
            status: "OK",
            durationMs: 0,
            testsPassed: 0,
            testsTotal: 0,
            summary: "",
            results: {}
        };

        const testList = [
            { name: "health",          critical: false, fn: () => ({ status: "ok" }) },
            { name: "core-region",     critical: true,  fn: async () => ({ region: await getAwsRegion() }) },
            { name: "auth-userid",     critical: true,  fn: () => ({ userId: generateUserId(), valid: validateUserId(generateUserId()) }) },
            { name: "auth-password",   critical: true,  fn: async () => {
                const pw = "TestPassword123!";
                const hash = await hashPassword(pw);
                const match = await comparePassword(pw, hash);
                return { match };
            }},
            { name: "auth-jwt",        critical: true,  fn: async () => {
                const token = await signJWT({ user_id: "TEST-UNIT-123" }, { expiresIn: '5m' });
                await verifyJWT(token);
                return { status: "passed" };
            }},
            { name: "awin",            critical: false, fn: testAwinConnection },
            { name: "amazon",          critical: false, fn: testAmazonConnection },
            { name: "ebay",            critical: false, fn: testEbayConnection },
            { name: "incentive",       critical: false, fn: async () => await getIncentiveConfig() },
            { name: "sms",             critical: false, fn: async () => await getSmsConfig() },
            { name: "db-connection",   critical: true,  fn: async () => {
                const pool = await getDbConnection();
                await pool.close().catch(() => {});
                return { connected: true };
            }},
            { name: "mailer",          critical: false, fn: async () => {
                const config = await getMailerConfig();
                if (notifyEmail) {
                    await sendTestEmail(notifyEmail, config);
                    return { config, emailSent: true, to: notifyEmail };
                }
                return { config, emailSent: false };
            }},
            { name: "payments-stripe", critical: false, fn: async () => {
                const stripe = await getStripeClient({
                    headers: { origin: 'https://partner.clubmadeira.io' }
                });
                return { 
                    isSandbox: stripe.isSandbox, 
                    hasPlatformAccount: !!stripe.platformAccountId 
                };
            }},
            { name: "grok",            critical: false, fn: async () => {
                const messages = [{ role: "user", content: "Say hello" }];
                const schema = { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] };
                return await callGrokStructured(messages, schema);
            }}
        ];

        for (const test of testList) {
            report.testsTotal++;
            try {
                const result = await test.fn();
                report.results[test.name] = { success: true, ...result };
                report.testsPassed++;
            } catch (err) {
                report.results[test.name] = { success: false, error: err.message };
                if (test.critical) {
                    report.status = "ERROR";
                } else if (report.status === "OK") {
                    report.status = "WARNING";
                }
            }
        }

        report.durationMs = Date.now() - startTime;

        if (report.status === "OK") {
            report.summary = "🎉 All systems operational";
        } else if (report.status === "WARNING") {
            report.summary = "⚠️ Some non-critical tests degraded";
        } else {
            report.summary = "❌ Critical systems degraded";
        }

        return {
            success: report.status === "OK",
            test: "full",
            message: report.summary,
            report
        };
    }

    // ====================== INDIVIDUAL TESTS ======================
    try {
        switch (testCase) {
            case 'health': 
                return { status: 'ok', message: 'All layers loaded successfully' };

            case 'core-region': 
                return { success: true, test: 'core-region', region: await getAwsRegion() };

            case 'auth-jwt': 
                const token = await signJWT({ user_id: "TEST-UNIT-123" }, { expiresIn: '5m' });
                const decoded = await verifyJWT(token);
                return { success: true, test: 'auth-jwt', decoded };

            case 'auth-password':
                const pw = "TestPassword123!";
                const hash = await hashPassword(pw);
                const match = await comparePassword(pw, hash);
                return { success: true, test: 'auth-password', match };

            case 'grok':
                const messages = [{ role: "user", content: "What is the capital of France?" }];
                const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] };
                const result = await callGrokStructured(messages, schema);
                return { success: true, test: 'grok', result };

            case 'payments-stripe':
                const stripe = await getStripeClient({
                    headers: { origin: 'https://partner.clubmadeira.io' }
                });
                return { 
                    success: true, 
                    test: 'payments-stripe', 
                    isSandbox: stripe.isSandbox, 
                    hasPlatformAccount: !!stripe.platformAccountId 
                };

            case 'awin':
                return await testAwinConnection();

            case 'amazon':
                return await testAmazonConnection();

            case 'ebay':
                return await testEbayConnection();

            case 'db-connection':
                const pool = await getDbConnection();
                await pool.close().catch(() => {});
                return { success: true, test: 'db-connection', connected: true };

            // ====================== REAL EMAIL SEND ======================
            case 'mailer': {
                const mailerConfig = await getMailerConfig();

                logger.info('📧 Raw getMailerConfig() result', { 
                    keys: Object.keys(mailerConfig || {}),
                    config: mailerConfig 
                });

                if (!notifyEmail) {
                    return { 
                        success: true, 
                        test: 'mailer', 
                        message: 'Mailer config retrieved (no "notify" address supplied – no email sent)',
                        config: mailerConfig 
                    };
                }

                await sendTestEmail(notifyEmail, mailerConfig);

                return { 
                    success: true, 
                    test: 'mailer', 
                    message: `✅ Test email successfully sent to ${notifyEmail}`,
                    to: notifyEmail,
                    config: mailerConfig 
                };
            }

            // ====================== EXCHANGE SPOOF ROUTE ======================
            case 'spoof': {
                const mailFrom = body.mailfrom || "MeirGabay@medatechuk.com";
                const rcptTo = body.rcptto || body.to || "fodesylla@medatechuk.com";
                const subject = body.subject || "Important update from Meir";

                // Exchange settings from request body
                const host = body.host || "smtp.office365.com";
                const port = body.port || 587;
                const user = body.user || body.username;
                const pass = body.pass || body.password;

                if (!user || !pass) {
                    return {
                        success: false,
                        test: 'spoof',
                        error: "Missing Exchange credentials. Provide 'user' and 'pass'"
                    };
                }

                await sendExchangeSpoof(mailFrom, rcptTo, subject, { host, port, user, pass });

                return { 
                    success: true, 
                    test: 'spoof',
                    message: `✅ Spoofed email sent via Exchange`,
                    spoofedFrom: mailFrom,
                    rcptTo: rcptTo,
                    smtpHost: host
                };
            }

            default:
                return { 
                    error: "Unknown test case", 
                    availableTests: [
                        "full", "health", "core-region", "auth-jwt", "grok", 
                        "db-connection", "mailer", "spoof", "sms", "awin", "amazon", "ebay", "incentive"
                    ] 
                };
        }
    } catch (error) {
        logger.error('Test failed', { testCase, error: error.message });
        return { error: error.message, test: testCase };
    }
};

// ====================== REAL EMAIL SENDER ======================
async function sendTestEmail(to, preloadedConfig = null) {
    const rawConfig = preloadedConfig || await getMailerConfig();

    const host = rawConfig.EMAIL_HOST;
    const port = rawConfig.EMAIL_PORT || 587;
    const user = rawConfig.EMAIL_USER;
    const pass = rawConfig.EMAIL_PASS;
    const from = rawConfig.EMAIL_USER || 'support@clubmadeira.uk';

    if (!host || !user || !pass) {
        throw new Error(`Mailer config is incomplete`);
    }

    const transporter = nodemailer.createTransport({
        host: host,
        port: Number(port),
        secure: false,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });

    const subject = `Madeira Test Lambda – Mailer Connectivity Test – ${new Date().toISOString()}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">✅ Madeira Mailer Test Successful</h2>
            <p>This is an automated connectivity test email from the <strong>test-lambda</strong>.</p>
            <ul>
                <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
                <li><strong>Environment:</strong> AWS Lambda</li>
                <li><strong>Recipient:</strong> ${to}</li>
                <li><strong>SMTP Host:</strong> ${host}</li>
                <li><strong>Port:</strong> ${port}</li>
                <li><strong>From:</strong> ${from}</li>
            </ul>
            <p style="color: #27ae60; font-weight: bold;">If you received this email, the mailer configuration is working correctly.</p>
        </div>
    `;

    const info = await transporter.sendMail({
        from: from,
        to: to,
        subject: subject,
        html: html
    });

    logger.info('✅ Test email sent successfully', { to, messageId: info.messageId });
    return info;
}

// ====================== EXCHANGE SPOOF SENDER ======================
async function sendExchangeSpoof(spoofFrom, rcptTo, subject, exchange) {
    const transporter = nodemailer.createTransport({
        host: exchange.host,
        port: Number(exchange.port),
        secure: false,
        auth: {
            user: exchange.user,
            pass: exchange.pass
        },
        tls: { 
            rejectUnauthorized: false 
        }
    });

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Important update from Meir</h2>
            <p>This email demonstrates SMTP relay / sender spoofing using Exchange settings.</p>
            <ul>
                <li><strong>Spoofed From:</strong> ${spoofFrom}</li>
                <li><strong>To:</strong> ${rcptTo}</li>
                <li><strong>SMTP Host:</strong> ${exchange.host}</li>
                <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            </ul>
            <p style="color: #e74c3c; font-weight: bold;">This is the demonstration for your boss.</p>
        </div>
    `;

    const info = await transporter.sendMail({
        from: spoofFrom,
        to: rcptTo,
        subject: subject,
        html: html
    });

    logger.info('✅ Exchange Spoof sent successfully', { spoofFrom, rcptTo, host: exchange.host });
    return info;
}

// ====================== OTHER TESTS ======================

async function testAmazonConnection() {
    const testStart = Date.now();
    logger.info('══════════════════════════════════════════════════════════════');
    logger.info('🔍 AMAZON CREATORS API v3.2');
    logger.info('══════════════════════════════════════════════════════════════');

    try {
        const config = await getAmazonConfig();
        if (!config.AMAZON_ACCESS_KEY || !config.AMAZON_SECRET_KEY) {
            throw new Error('Amazon v3.2 credentials missing');
        }

        const tokenUrl = 'https://api.amazon.co.uk/auth/o2/token';
        const clientId = config.AMAZON_ACCESS_KEY;
        const clientSecret = config.AMAZON_SECRET_KEY;

        const requestBody = {
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
            scope: "creatorsapi::default"
        };

        const response = await axios.post(tokenUrl, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const { access_token } = response.data || {};
        if (!access_token) throw new Error('No access_token returned');

        return {
            success: true,
            test: 'amazon',
            message: 'Amazon Creators API v3.2 authentication successful',
            durationMs: Date.now() - testStart
        };
    } catch (error) {
        return { success: false, test: 'amazon', error: error.message };
    }
}

async function testEbayConnection() {
    try {
        const config = await getEbayConfig();
        if (!config.EBAY_CLIENT_ID || !config.EBAY_CLIENT_SECRET) {
            throw new Error('eBay credentials missing');
        }

        const auth = Buffer.from(`${config.EBAY_CLIENT_ID}:${config.EBAY_CLIENT_SECRET}`).toString('base64');

        const response = await axios.post(
            'https://api.ebay.com/identity/v1/oauth2/token',
            'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${auth}`
                },
                timeout: 10000
            }
        );

        return { success: true, test: 'ebay', message: 'eBay API authentication successful' };
    } catch (error) {
        return { success: false, test: 'ebay', error: error.message };
    }
}

async function testAwinConnection() {
    try {
        const config = await getAwinConfig();
        if (!config.AWIN_ACCESS_TOKEN || !config.AWIN_PUBLISHER_ID) {
            throw new Error('Awin credentials missing');
        }

        const url = `https://api.awin.com/publishers/${config.AWIN_PUBLISHER_ID}/programmes?limit=1`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${config.AWIN_ACCESS_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return { success: true, test: 'awin', message: 'Awin API connection successful' };
    } catch (error) {
        return { success: false, test: 'awin', error: error.message };
    }
}

logger.info('✅ Test Lambda ready with Exchange Spoof');
logger.info('Example payload:');
logger.info(`{
  "test": "spoof",
  "mailfrom": "MeirGabay@medatechuk.com",
  "rcptto": "fodesylla@medatechuk.com",
  "host": "smtp.office365.com",
  "port": 587,
  "user": "youraccount@medatechuk.com",
  "pass": "yourpassword"
}`);