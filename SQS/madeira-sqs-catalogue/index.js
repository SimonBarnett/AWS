// ====================== madeira-sqs-catalogue/index.js ======================
// Thin SQS Orchestrator

const { logger } = require('/opt/nodejs/helpers');
const { getDbPool } = require('/opt/nodejs/conf/db-config');

exports.handler = async (event) => {
    logger.info('SQS Orchestrator started', {
        recordCount: event.Records?.length || 0
    });

    const batchItemFailures = [];
    let pool = null;

    try {
        pool = await getDbPool();

        for (const record of event.Records || []) {
            let payload;

            try {
                payload = JSON.parse(record.body);
                const messageType = (payload.type || 'UNKNOWN').toUpperCase();

                const enrichedPayload = {
                    ...payload,
                    sandbox: payload.sandbox === true,
                    pool
                };

                logger.debug('Routing SQS message', {
                    messageId: record.messageId,
                    type: messageType
                });

                switch (messageType) {

                    case 'ONBOARDING':
                        await require('./sqs/onboarding').handle(enrichedPayload);
                        break;

                    case 'CATEGORY_UPDATE':
                        await require('./sqs/process-update').handle(enrichedPayload);
                        break;

                    case 'CLUBSCAN_GENERATE_REVIEW':
                        await require('./sqs/generate-review').handle(enrichedPayload);
                        break;

                    case 'CLUBSCAN_GENERATE_CATEGORIES':
                        await require('./sqs/generate-categories').handle(enrichedPayload);
                        break;

                    case 'CLUBSCAN_BUILD_CATALOG':
                        await require('./sqs/build-catalog').handle(enrichedPayload);
                        break;

                    case 'CLUBSCAN_NOTIFY':
                        await require('./sqs/notify').handle(enrichedPayload);
                        break;

                    // === NEW: Email sending via SQS ===
                    case 'SEND_EMAIL':
                        await require('./emails').handleSendEmail(enrichedPayload);
                        break;

                    default:
                        logger.warn('Unknown message type — skipping', {
                            messageId: record.messageId,
                            type: messageType
                        });
                        break;
                }

            } catch (error) {
                logger.error('Failed to process SQS record', {
                    messageId: record.messageId,
                    type: payload?.type,
                    error: error.message
                });

                batchItemFailures.push({ itemIdentifier: record.messageId });
            }
        }

    } catch (err) {
        logger.error('SQS Orchestrator failed', { error: err.message });
        throw err;
    }

    return { batchItemFailures };
};