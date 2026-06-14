// Lambdas/madeira-posthog-updatedb/index.js
// PostHog Event Ingestion Lambda - Modernised to use shared layers

// Uses shared helpers layer for logging, DB connection, and mssql

const { logger, sql, getDbConnection } = require('/opt/nodejs/helpers');

exports.handler = async (event) => {
    let pool = null;

    try {
        pool = await getDbConnection();

        // === Determine last run time ===
        let lastRun;
        const eventsExistResult = await pool.request().query('SELECT TOP 1 1 FROM PostHogEvents');

        if (eventsExistResult.recordset.length === 0) {
            lastRun = '1900-01-01T00:00:00Z';
        } else {
            const lastsResult = await pool.request()
                .input('operationName', sql.VarChar, 'FetchPostHogEvents')
                .query('SELECT LastRun FROM LASTS WHERE OperationName = @operationName');

            if (lastsResult.recordset.length === 0) {
                const maxTimestampResult = await pool.request()
                    .query('SELECT MAX(timestamp) as maxTimestamp FROM PostHogEvents');
                lastRun = maxTimestampResult.recordset[0].maxTimestamp.toISOString();
            } else {
                lastRun = lastsResult.recordset[0].LastRun.toISOString();
            }
        }

        logger.info('Starting PostHog event sync', { lastRun });

        // === Fetch all events from PostHog (with pagination) ===
        const postHogEvents = await fetchAllPostHogEvents(lastRun);
        logger.info('Fetched events from PostHog', { total: postHogEvents.length });

        // Filter events that have a source property
        const filteredEvents = postHogEvents.filter(e => e.properties && e.properties.source);
        logger.info('Events after filtering (have source)', { count: filteredEvents.length });

        if (filteredEvents.length === 0) {
            logger.info('No new events to process');
            return { statusCode: 200, body: 'No new events' };
        }

        // === Collect unique user IDs (source + destination) ===
        const userIds = new Set();
        filteredEvents.forEach(event => {
            if (event.properties?.source) userIds.add(event.properties.source);
            if (event.properties?.destination) userIds.add(event.properties.destination);
        });

        // === Fetch referrers for those users ===
        let referrerMap = {};
        if (userIds.size > 0) {
            const userIdArray = Array.from(userIds);
            const placeholders = userIdArray.map((_, i) => `@uid${i}`).join(',');
            const query = `SELECT user_id, referrer FROM Users WHERE user_id IN (${placeholders})`;

            const request = pool.request();
            userIdArray.forEach((uid, i) => request.input(`uid${i}`, sql.VarChar, uid));

            const result = await request.query(query);
            result.recordset.forEach(row => {
                referrerMap[row.user_id] = row.referrer;
            });

            logger.info('Fetched referrers', { userCount: userIdArray.length });
        }

        // === Prepare bulk insert into PostHogEvents ===
        const table = new sql.Table('PostHogEvents');
        table.create = false;

        table.columns.add('eventtype', sql.VarChar(50), { nullable: false });
        table.columns.add('source', sql.VarChar, { nullable: true });
        table.columns.add('source_url', sql.VarChar(255), { nullable: true });
        table.columns.add('destination', sql.VarChar, { nullable: true });
        table.columns.add('destination_url', sql.VarChar(255), { nullable: true });
        table.columns.add('IP', sql.VarChar(45), { nullable: true });
        table.columns.add('source_referrer', sql.VarChar(255), { nullable: true });
        table.columns.add('destination_referrer', sql.VarChar(255), { nullable: true });
        table.columns.add('timestamp', sql.DateTime, { nullable: false });
        table.columns.add('order_id', sql.VarChar(50), { nullable: true });
        table.columns.add('sale_value', sql.Decimal(18, 2), { nullable: true });

        filteredEvents.forEach(event => {
            const props = event.properties || {};
            const isOrder = event.event === 'order';

            const sourceReferrer = props.source ? referrerMap[props.source] || null : null;
            const destinationReferrer = props.destination ? referrerMap[props.destination] || null : null;

            table.rows.add(
                event.event || 'unknown',
                props.source || null,
                props.source_url || null,
                props.destination || null,
                props.destination_url || null,
                props.ip || props.$ip || null,
                sourceReferrer,
                destinationReferrer,
                new Date(event.timestamp || Date.now()),
                isOrder ? props.order_id || null : null,
                isOrder ? props.sale_value || null : null
            );
        });

        // === Bulk insert ===
        if (table.rows.length > 0) {
            await pool.request().bulk(table);
            logger.info('Bulk inserted events into PostHogEvents', { count: table.rows.length });
        }

        // === Update LASTS table ===
        const now = new Date();
        await pool.request()
            .input('currentTime', sql.DateTime, now)
            .input('operationName', sql.VarChar, 'FetchPostHogEvents')
            .query(`
                MERGE LASTS AS target
                USING (SELECT @operationName AS OperationName, @currentTime AS LastRun) AS source
                ON target.OperationName = source.OperationName
                WHEN MATCHED THEN UPDATE SET LastRun = source.LastRun
                WHEN NOT MATCHED THEN INSERT (OperationName, LastRun)
                    VALUES (source.OperationName, source.LastRun)
            `);

        logger.info('PostHog sync completed successfully', {
            eventsProcessed: filteredEvents.length,
            lastRun: now.toISOString()
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                eventsProcessed: filteredEvents.length
            })
        };

    } catch (error) {
        logger.error('PostHog sync failed', {
            error: error.message,
            stack: error.stack
        });

        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };

    } finally {
        if (pool) {
            await pool.close().catch(() => {});
        }
    }
};

/**
 * Fetch all PostHog events since lastRun using pagination.
 * Uses native fetch (no axios dependency).
 */
async function fetchAllPostHogEvents(lastRun) {
    const projectId = process.env.POSTHOG_PROJECT_ID;
    const apiKey = process.env.POSTHOG_API_KEY;
    const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

    if (!projectId || !apiKey) {
        throw new Error('POSTHOG_PROJECT_ID and POSTHOG_API_KEY environment variables are required');
    }

    let url = `${host}/api/projects/${projectId}/events?after=${encodeURIComponent(lastRun)}`;
    const allEvents = [];
    let page = 0;

    while (url) {
        logger.debug('Fetching PostHog page', { page, url });

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`PostHog API error ${response.status}: ${text}`);
        }

        const data = await response.json();
        const events = data.results || [];
        allEvents.push(...events);

        url = data.next || null;
        page++;

        if (page > 50) { // Safety limit
            logger.warn('PostHog pagination safety limit reached (50 pages)');
            break;
        }
    }

    logger.info('Completed PostHog fetch', { totalEvents: allEvents.length, pages: page });
    return allEvents;
}