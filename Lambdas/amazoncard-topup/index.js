// ====================== Lambdas/amazoncard-topup/index.js ======================
// Amazon Gift Card Topup Handler (AGCOD v2) - Standalone Lambda
// Uses centralized incentive config from layer

const AWS = require('aws-sdk');
const https = require('https');
const { sql, logger, getDbConnection } = require('/opt/nodejs/helpers');
const { getIncentiveConfig } = require('/opt/nodejs/conf/incentive-config');

exports.handler = async (event) => {
    let pool = null;

    try {
        // Load config from SSM via layer (with caching)
        const config = await getIncentiveConfig();

        const partnerId = config.AMAZON_PARTNER_ID;
        const accessKey = config.AMAZON_ACCESS_KEY_ID;
        const secretKey = config.AMAZON_SECRET_ACCESS_KEY;
        const brand     = config.AMAZON_BRAND || 'Club Madeira';
        const currency  = (config.AMAZON_CURRENCY || 'GBP').toUpperCase();
        const isSandbox = (config.AMAZON_SANDBOX || 'true') === 'true';

        // Budget remains as a direct environment variable
        const budget = parseFloat(process.env.BUDGET);

        if (!partnerId) throw new Error('AMAZON_PARTNER_ID is required (from incentive config)');
        if (!accessKey || !secretKey) {
            throw new Error('AMAZON_ACCESS_KEY_ID and AMAZON_SECRET_ACCESS_KEY are required (from incentive config)');
        }
        if (isNaN(budget) || budget <= 0) {
            throw new Error('BUDGET must be a positive number (set as environment variable)');
        }

        logger.info('Starting Amazon Gift Card Topup', {
            budget: `£${budget}`,
            environment: isSandbox ? 'SANDBOX' : 'PRODUCTION',
            currency,
            brand
        });

        // Card generation logic (unchanged)
        let cards = [];
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

        logger.info(`Generated card denominations: [${cards.join(', ')}] (Total: £${cards.reduce((a, b) => a + b, 0)})`);

        pool = await getDbConnection();
        let insertedCount = 0;

        const signer = new AWS.Signers.V4(
            { service: 'execute-api', region: 'us-east-1' },
            'AGCODService'
        );
        const credentials = new AWS.Credentials(accessKey, secretKey);

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

            const options = {
                hostname,
                path: '/CreateGiftCard',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Amz-Target': 'com.amazonaws.agcod.AGCODService.CreateGiftCard',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const requestDate = new Date();
            signer.addAuthorization(credentials, requestDate);
            Object.assign(options.headers, signer.headers);

            const result = await new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            resolve(JSON.parse(data));
                        } else {
                            reject(new Error(`Amazon API Error: ${data}`));
                        }
                    });
                });

                req.on('error', reject);
                req.write(body);
                req.end();
            });

            const claimCode = result.gcClaimCode;
            const gcId = result.gcId;

            logger.info(`Created £${value} gift card`, { claimCode, gcId });

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

        // Day-of-week cycling
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

        logger.info('Topup completed successfully', {
            inserted: insertedCount,
            totalValue: cards.reduce((a, b) => a + b, 0)
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                inserted: insertedCount,
                totalValue: cards.reduce((a, b) => a + b, 0),
                cards: cards
            })
        };

    } catch (error) {
        logger.error('Amazon Gift Card Topup failed', { error: error.message });
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