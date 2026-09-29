// Lambdas/amazoncard-topup/index.js
// Amazon Gift Card Top-up Lambda (AGCOD v2)
// Skips credential requirement when running in sandbox mode

const AWS = require('aws-sdk');
const https = require('https');

const { sql, logger, getDbConnection } = require('/opt/nodejs/helpers');
const { getIncentiveConfig } = require('/opt/nodejs/helpers');

exports.handler = async (event) => {
    let pool = null;

    try {
        const config = await getIncentiveConfig();

        const partnerId = config.AMAZON_PARTNER_ID;
        const accessKey = config.AMAZON_ACCESS_KEY_ID;
        const secretKey = config.AMAZON_SECRET_ACCESS_KEY;
        const brand     = config.AMAZON_BRAND || 'Club Madeira';
        const currency  = (config.AMAZON_CURRENCY || 'GBP').toUpperCase();
        const isSandbox = String(config.AMAZON_SANDBOX || 'true').toLowerCase() === 'true';

        const budget = parseFloat(process.env.BUDGET);

        // Only require real credentials when NOT in sandbox
        const credentialsMissing = !partnerId || !accessKey || !secretKey || 
                                   accessKey === 'CHANGE_ME' || secretKey === 'CHANGE_ME';

        if (credentialsMissing && !isSandbox) {
            logger.warn('Amazon credentials not configured (still placeholders in SSM).');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    mode: 'no-credentials',
                    message: 'Amazon credentials not yet configured in SSM.',
                    simulatedCards: 0
                })
            };
        }

        if (isNaN(budget) || budget <= 0) {
            throw new Error('BUDGET must be a positive number (set via environment variable)');
        }

        logger.info('Amazon Gift Card Top-up started', {
            budget: `£${budget}`,
            environment: isSandbox ? 'SANDBOX' : 'PRODUCTION',
            currency,
            brand
        });

        // === Generate card denominations ===
        const cards = [];
        let remaining = budget;

        if (Math.random() < 0.25) {
            cards.push(10);
            remaining -= 10;
        }

        cards.push(5);
        remaining -= 5;

        if (Math.random() < 0.5) {
            cards.push(5);
            remaining -= 5;
        }

        if (remaining >= 1) {
            const numTwoPound = Math.floor(remaining / 4);
            const numOnePound = remaining % 4 + (2 * numTwoPound);

            for (let i = 0; i < numTwoPound; i++) cards.push(2);
            for (let i = 0; i < numOnePound; i++) cards.push(1);
        }

        const totalValue = cards.reduce((sum, val) => sum + val, 0);
        logger.info('Generated gift card denominations', {
            cards,
            totalValue: `£${totalValue}`
        });

        pool = await getDbConnection();
        let insertedCount = 0;

        // Only attempt real AGCOD calls if we have valid credentials
        if (!credentialsMissing) {
            const credentials = {
                accessKeyId: accessKey,
                secretAccessKey: secretKey
            };

            const hostname = isSandbox
                ? 'agcod-v2-gamma.amazon.com'
                : 'agcod-v2.amazon.com';

            for (const value of cards) {
                const creationRequestId = `MADEIRA-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

                const body = JSON.stringify({
                    creationRequestId,
                    partnerId,
                    value: {
                        amount: value,
                        currencyCode: currency
                    }
                });

                const request = new AWS.HttpRequest({
                    method: 'POST',
                    hostname,
                    path: '/CreateGiftCard',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Amz-Target': 'com.amazonaws.agcod.AGCODService.CreateGiftCard',
                        'Content-Length': Buffer.byteLength(body).toString()
                    },
                    body
                });

                const signer = new AWS.Signers.V4(request, 'AGCODService');
                signer.addAuthorization(credentials, new Date());

                const options = {
                    hostname: request.hostname,
                    path: request.path,
                    method: request.method,
                    headers: request.headers
                };

                const result = await new Promise((resolve, reject) => {
                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => (data += chunk));
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                resolve(JSON.parse(data));
                            } else {
                                reject(new Error(`Amazon AGCOD error (status ${res.statusCode}): ${data}`));
                            }
                        });
                    });

                    req.on('error', (err) => reject(new Error(`Amazon request failed: ${err.message}`)));
                    req.write(body);
                    req.end();
                });

                const claimCode = result.gcClaimCode;
                const gcId = result.gcId;

                logger.info('Amazon gift card created', {
                    value: `£${value}`,
                    claimCode,
                    gcId
                });

                await pool.request()
                    .input('code', sql.NVarChar(100), claimCode)
                    .input('value', sql.Decimal(10, 2), value)
                    .input('currency', sql.NVarChar(3), currency)
                    .input('status', sql.NVarChar(20), 'available')
                    .input('amazon_gc_id', sql.NVarChar(100), gcId)
                    .query(`
                        INSERT INTO amazon_cards (code, value, currency, status, amazon_gc_id, created_at)
                        VALUES (@code, @value, @currency, @status, @amazon_gc_id, GETDATE())
                    `);

                insertedCount++;
            }
        } else {
            logger.info('[SANDBOX] Skipping real AGCOD calls due to missing credentials');
            // In sandbox with no credentials, we still simulate the number of cards that would have been created
            insertedCount = cards.length;
        }

        // === Day-of-week cycling for distribution ===
        await pool.request().query(`
            WITH Numbered AS (
                SELECT 
                    id,
                    (ROW_NUMBER() OVER (ORDER BY id) - 1) % 7 AS new_day
                FROM amazon_cards 
                WHERE status = 'available'
            )
            UPDATE ac 
            SET day_of_week = n.new_day,
                updated_at = GETDATE()
            FROM amazon_cards ac
            JOIN Numbered n ON ac.id = n.id;
        `);

        logger.info('Amazon Gift Card Top-up completed successfully', {
            inserted: insertedCount,
            totalValue: `£${totalValue}`,
            sandbox: isSandbox
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                inserted: insertedCount,
                totalValue,
                cards,
                sandbox: isSandbox
            })
        };

    } catch (error) {
        logger.error('Amazon Gift Card Top-up failed', {
            error: error.message,
            stack: error.stack
        });

        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                reason: error.message
            })
        };
    } finally {
        if (pool) {
            await pool.close().catch(() => {});
        }
    }
};