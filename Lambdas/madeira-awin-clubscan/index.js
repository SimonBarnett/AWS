// index.js - madeira-awin-clubscan

const { getDbConnection, logger } = require('/opt/nodejs/helpers');

const syncMerchantsRoute = require('./routes/sync-merchants');
const enrichRoute        = require('./routes/enrich');
const syncVouchersRoute  = require('./routes/sync-vouchers');   // ← NEW
const clubRoute          = require('./routes/club');
const globalRoute        = require('./routes/global');
const onboardingRoute    = require('./routes/onboarding');
const awinPaymentsRoute  = require('./routes/awin-payments');
const missingApiKeysRoute = require('./routes/notify-missing-apikeys');

exports.handler = async (event) => {
    logger.info('madeira-awin-clubscan orchestrator started', {
        route: event.route,
        hasClubId: !!event.clubId,
        isOnboarding: event.onboarding === true || event.route === 'onboarding',
        isSyncOnly: event.route === 'sync-merchants',
        isEnrichOnly: event.route === 'enrich' || event.route === 'enrich-merchants',
        isVouchersOnly: event.route === 'sync-vouchers' || event.route === 'awin-vouchers',
        isPaymentsOnly: event.route === 'awin-payments',
        isMissingKeys: event.route === 'notify-missing-apikeys' || event.route === 'missing-api-keys'
    });

    let pool = null;

    try {
        pool = await getDbConnection();

        // ====================== INDEPENDENT ROUTES ======================
        if (event.route === 'sync-merchants') {
            logger.info('Independent sync-merchants route triggered');
            return await syncMerchantsRoute.run(pool);
        }

        if (event.route === 'enrich' || event.route === 'enrich-merchants') {
            logger.info('Independent enrich route triggered');
            return await enrichRoute.run(pool);
        }

        if (event.route === 'sync-vouchers' || event.route === 'awin-vouchers') {
            logger.info('Independent sync-vouchers route triggered');
            return await syncVouchersRoute.run(pool);
        }

        if (event.route === 'awin-payments') {
            logger.info('Independent awin-payments route triggered');
            return await awinPaymentsRoute.run(pool);
        }

        if (event.route === 'notify-missing-apikeys' || event.route === 'missing-api-keys') {
            logger.info('🚨 Missing API Keys notification route triggered');
            return await missingApiKeysRoute.handler(event, { pool });
        }

        // ====================== ONBOARDING ======================
        if (event.onboarding === true || event.route === 'onboarding') {
            logger.info('Onboarding detected → running sync + payments first');

            await syncMerchantsRoute.run(pool);
            await awinPaymentsRoute.run(pool);

            logger.info('Background jobs completed before onboarding');
            return await onboardingRoute.handler(event, { pool });
        }

        // ====================== CLUB-SPECIFIC ======================
        if (event.clubId) {
            logger.info('Club route triggered', { clubId: event.clubId });
            return await clubRoute.handler(event, { pool });
        }

        // ====================== GLOBAL / DEFAULT ======================
        logger.info('Global route triggered (default)');
        return await globalRoute.handler(event, { pool });

    } catch (error) {
        logger.error('Orchestrator failed', {
            error: error.message,
            stack: error.stack,
            route: event.route
        });
        return { statusCode: 500, body: error.message };
    } finally {
        if (pool) {
            // pool left open intentionally
        }
    }
};