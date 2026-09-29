// ====================== nodejs/stripe.js ======================
// Stripe client factory with live/sandbox support
// Supports both env-based detection + partner's index.json (original behavior)
// Last updated: 03 June 2026

const stripeLib = require('stripe');
const axios = require('axios');
const { getStripeConfig, logger } = require('/opt/nodejs/helpers');

/**
 * Get a fully configured Stripe client (live or sandbox)
 */
async function getStripeClient(event = {}, options = {}) {
    const transactionId = `stripe-init-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    logger.debug('💳 Initializing Stripe client', { transactionId });

    try {
        const config = await getStripeConfig();
        let isSandbox = false;

        // Priority 1: Explicit option
        if (options.sandbox !== undefined) {
            isSandbox = !!options.sandbox;
        } 
        // Priority 2: Event flag
        else if (event.sandbox === true || event.sandbox === 'true') {
            isSandbox = true;
        } 
        // Priority 3: Partner's index.json (original behavior)
        else if (event.headers?.origin) {
            try {
                const origin = event.headers.origin;
                const indexUrl = `${origin}/index.json`;

                logger.debug('Fetching partner index.json to determine sandbox mode', { 
                    transactionId, 
                    indexUrl 
                });

                const response = await axios.get(indexUrl, { timeout: 5000 });
                const data = response.data || {};

                if (typeof data.sandbox === 'boolean') {
                    isSandbox = data.sandbox;
                    logger.debug('Sandbox mode determined from partner index.json', { 
                        transactionId, 
                        sandbox: isSandbox 
                    });
                }
            } catch (fetchError) {
                logger.warn('Failed to fetch partner index.json, falling back to env detection', {
                    transactionId,
                    error: fetchError.message
                });
            }
        }

        // Priority 4: Environment variable fallback (fixed)
        if (!isSandbox && process.env.SANDBOX) {
            isSandbox = process.env.SANDBOX.toLowerCase() === 'true';
        }

        const secretKey = isSandbox
            ? (process.env.STRIPE_TEST_SECRET_KEY || config.STRIPE_TEST_SECRET_KEY)
            : (process.env.STRIPE_SECRET_KEY || config.STRIPE_SECRET_KEY);

        if (!secretKey || secretKey === 'CHANGE_ME') {
            logger.error('Stripe client init failed - secret key not configured', { transactionId });
            throw new Error('Stripe secret key is missing or not configured.');
        }

        const client = stripeLib(secretKey, {
            apiVersion: '2024-06-20',
            typescript: false
        });

        // Attach useful metadata
        client.platformAccountId = config.PLATFORM_ACCOUNT_ID;
        client.platformCustomerId = isSandbox ? config.PLATFORM_CUSTOMER_ID_TEST : config.PLATFORM_CUSTOMER_ID;
        client.platformPaymentMethod = isSandbox ? config.PLATFORM_PAYMENT_METHOD_TEST : config.PLATFORM_PAYMENT_METHOD;
        client.vatTaxRateId = isSandbox ? config.VAT_TAX_RATE_ID_TEST : config.VAT_TAX_RATE_ID;
        client.isSandbox = isSandbox;

        logger.info('✅ Stripe client initialized successfully', {
            transactionId,
            mode: isSandbox ? 'TEST (sandbox)' : 'LIVE'
        });

        return client;

    } catch (error) {
        logger.error('❌ Stripe client initialization failed', { transactionId, error: error.message });
        throw error;
    }
}

module.exports = { getStripeClient };

logger.info('✅ Stripe module loaded successfully (live/sandbox + partner index.json support)');