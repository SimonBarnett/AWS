// index.js - madeira-awin-clubscan (CLEAN ORCHESTRATOR)
// Updated to use shared layers

const { getDbConnection, logger } = require('/opt/nodejs/helpers');

const syncMerchantsRoute = require('./routes/sync-merchants');
const clubRoute          = require('./routes/club');
const globalRoute        = require('./routes/global');
const onboardingRoute    = require('./routes/onboarding');
const awinPaymentsRoute  = require('./routes/awin-payments');

exports.handler = async (event) => {
    logger.info('🚀 madeira-awin-clubscan orchestrator started', {
        route: event.route,
        hasClubId: !!event.clubId,
        isOnboarding: event.onboarding === true || event.route === 'onboarding',
        isSyncOnly: event.route === 'sync-merchants',
        isPaymentsOnly: event.route === 'awin-payments'
    });

    let pool = null;

    try {
        pool = await getDbConnection();

        // ====================== INDEPENDENT ROUTES ======================
        if (event.route === 'sync-merchants') {
            logger.info('🔄 Independent sync-merchants route triggered');
            return await syncMerchantsRoute.run(pool);
        }

        if (event.route === 'awin-payments') {
            logger.info('💰 Independent awin-payments route triggered');
            return await awinPaymentsRoute.run(pool);
        }

        // ====================== ONBOARDING ======================
        if (event.onboarding === true || event.route === 'onboarding') {
            logger.info('🔄 Onboarding detected → running sync + payments first');

            await syncMerchantsRoute.run(pool);
            await awinPaymentsRoute.run(pool);

            logger.info('✅ Background jobs completed before onboarding');
            return await onboardingRoute.handler(event, { pool });
        }

        // ====================== CLUB-SPECIFIC ======================
        if (event.clubId) {
            logger.info('🎯 Club route triggered', { clubId: event.clubId });
            return await clubRoute.handler(event, { pool });
        }

        // ====================== GLOBAL / DEFAULT ======================
        logger.info('🎯 Global route triggered (default)');
        return await globalRoute.handler(event, { pool });

    } catch (error) {
        logger.error('💥 Orchestrator failed', {
            error: error.message,
            stack: error.stack,
            route: event.route
        });
        return { statusCode: 500, body: error.message };
    } finally {
        if (pool) {
            await pool.close().catch(err =>
                logger.warn('Pool close warning', { error: err.message })
            );
        }
    }
};