// ====================== routes/ui/stripe.js ======================
// Reconnect / Re-onboard Stripe for already logged-in users
// This is a LOGGED-IN ONLY endpoint (requires valid JWT)
// Called from the user-widget.js via POST /ui/stripe
// FIXED: Removed non-existent column 'stripe_onboarding_completed'

const { logger, sql, executeWithRetry } = require('/opt/nodejs/helpers');
const { getUserById } = require('../token/helpers');

// Robust way to get Stripe client from the shared layer
let stripeClientFn = null;
try {
    const stripeModule = require('/opt/nodejs/stripe');
    stripeClientFn = stripeModule.getStripeClient || stripeModule;
} catch (e1) {
    try {
        const helpers = require('/opt/nodejs/helpers');
        stripeClientFn = helpers.getStripeClient;
    } catch (e2) {
        logger.error('Failed to load Stripe client from layer', { error: e2.message });
    }
}

module.exports = async (event, { pool, sandbox = false }) => {
    logger.info('🟣 [STRIPE] /ui/stripe handler INVOKED');

    try {
        const decoded = event.decoded;

        logger.debug('[STRIPE] Decoded token check', { 
            hasDecoded: !!decoded, 
            userId: decoded?.user_id 
        });

        if (!decoded?.user_id) {
            logger.warn('Stripe reconnect called without valid JWT');
            return { 
                statusCode: 401, 
                body: { 
                    status: 'error', 
                    error_message: 'Unauthorized - login required' 
                } 
            };
        }

        logger.info('Stripe Reconnect requested', { userId: decoded.user_id });

        const user = await getUserById(decoded.user_id, event, pool);
        if (!user) {
            logger.warn('User not found during Stripe reconnect', { userId: decoded.user_id });
            return { 
                statusCode: 404, 
                body: { 
                    status: 'error', 
                    error_message: 'User not found' 
                } 
            };
        }

        if (!stripeClientFn) {
            logger.error('Stripe client function not available in layer');
            return { 
                statusCode: 500, 
                body: { 
                    status: 'error', 
                    error_message: 'Stripe service unavailable' 
                } 
            };
        }

        let stripe;
        try {
            stripe = await stripeClientFn(event);
        } catch (stripeErr) {
            logger.error('Failed to initialize Stripe client', { error: stripeErr.message });
            return { 
                statusCode: 500, 
                body: { 
                    status: 'error', 
                    error_message: 'Failed to initialize payment provider' 
                } 
            };
        }

        // ====================== CREATE NEW STRIPE CONNECT ACCOUNT ======================
        const account = await stripe.accounts.create({
            type: 'express',
            email: user.email_address,
            metadata: {
                user_id: user.user_id,
                re_onboarded: 'true',
                previous_stripe_account: user.stripe_account_id || 'none'
            }
        });

        const newStripeAccountId = account.id;

        logger.info('New Stripe account created for reconnection', {
            userId: user.user_id,
            newStripeAccountId
        });

        // ====================== UPDATE USER RECORD (FIXED - removed non-existent column) ======================
        await executeWithRetry(async () => {
            return await pool.request()
                .input('user_id', sql.Char(8), user.user_id)
                .input('stripe_account_id', sql.VarChar(255), newStripeAccountId)
                .query(`
                    UPDATE Users 
                    SET stripe_account_id = @stripe_account_id,
                        updated_at = GETDATE()
                    WHERE user_id = @user_id
                `);
        });

        // ====================== GENERATE ONBOARDING LINK ======================
        const origin = event.headers.origin || 'https://partner.clubmadeira.io';

        const return_url = `${origin}/delegate.html?stripe=success`;
        const refresh_url = `${origin}/delegate.html?stripe=fail`;

        const accountLink = await stripe.accountLinks.create({
            account: newStripeAccountId,
            refresh_url,
            return_url,
            type: 'account_onboarding'
        });

        logger.info('Stripe reconnection link generated successfully', { userId: user.user_id });

        return {
            statusCode: 200,
            body: {
                status: 'success',
                stripe_account_id: newStripeAccountId,
                onboarding_url: accountLink.url,
                message: 'New Stripe account created. Please complete onboarding.'
            }
        };

    } catch (error) {
        logger.error('🔥 CRITICAL ERROR in /ui/stripe handler', {
            error: error.message,
            stack: error.stack,
            userId: event.decoded?.user_id
        });

        return {
            statusCode: 500,
            body: {
                status: 'error',
                error_message: 'Failed to reconnect Stripe account. Please try again later.'
            }
        };
    }
};