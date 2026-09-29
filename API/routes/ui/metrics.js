// ====================== routes/ui/metrics.js ======================
// Full original logic restored + adapted to pool + executeWithRetry + ALL METRICS updated + Partner & Admin merged into single onboarding cards with first-of-month filter

const { logger, executeWithRetry, sql } = require('/opt/nodejs/helpers');

// Helper to run a query
async function executeQuery(pool, query, params = {}) {
    const request = pool.request();
    Object.entries(params).forEach(([key, value]) => {
        request.input(key, value);
    });
    const result = await executeWithRetry(() => request.query(query));
    return result.recordset;
}

// Generate HTML cards
function generateMetricsHtml(metrics) {
    const cardsHtml = metrics.map(metric => `
        <div class="metric-card">
            <i class="fas ${metric.icon}"></i>
            <h3>${metric.title}</h3>
            <p>${metric.value}</p>
        </div>
    `).join('');
    return `<div class="metrics-container">${cardsHtml}</div>`;
}

module.exports = async (event, { pool, sandbox = false } = {}) => {
    try {
        const decoded = event.decoded;
        const userId = decoded.user_id;
        const permissions = decoded.permissions || [];

        const roles = permissions.filter(r => ['admin', 'merchant', 'community', 'partner'].includes(r));

        if (roles.length === 0) {
            return { statusCode: 403, body: { message: 'No valid roles' } };
        }

        const metrics = [];

        if (roles.includes('community')) metrics.push(...await fetchCommunityMetrics(pool, userId));
        if (roles.includes('merchant')) metrics.push(...await fetchMerchantMetrics(pool, userId));
        if (roles.includes('partner')) metrics.push(...await fetchPartnerMetrics(pool, userId));
        if (roles.includes('admin')) metrics.push(...await fetchAdminMetrics(pool, userId));

        const html = generateMetricsHtml(metrics);

        if (sandbox) logger.debug('[SANDBOX] metrics generated', { userId, roles });

        return { statusCode: 200, body: { html } };

    } catch (error) {
        logger.error('Metrics error', { error: error.message });
        return { statusCode: 500, body: { message: error.message } };
    }
};

// ======================
// METRICS FUNCTIONS
// ======================

async function fetchCommunityMetrics(pool, userId) {
    const metrics = [];

    // Categories metric — exact layout you requested
    const catResult = await executeQuery(pool,
        'select count(*) as count from Catalog where UserId = @userId',
        { userId });
    const catCount = catResult[0].count || 0;

    const catViewsResult = await executeQuery(pool, `
        select count(*) as views 
        from UserFingerprints fp
        join FingerprintCatalogAccess ca on fp.id = ca.fingerprint_id
        where user_id = @userId
        and ProductID is null
        and ca.timestamp > dateadd(day,-30,getdate())`, { userId });
    const catViews = catViewsResult[0].views || 0;

    metrics.push({ 
        title: 'Catalog Overview', 
        value: `Categories : ${catCount}<br>views : ${catViews}`, 
        icon: 'fa-list-alt' 
    });

    // Parts metric — exact layout you requested
    const partsResult = await executeQuery(pool,
        'SELECT COUNT(*) as count FROM Products WHERE UserId = @userId',
        { userId });
    const partsCount = partsResult[0].count || 0;

    const partsClicksResult = await executeQuery(pool, `
        select count(*) as clicks 
        from UserFingerprints fp
        join FingerprintCatalogAccess ca on fp.id = ca.fingerprint_id
        where user_id = @userId
        and ProductID is not null
        and ca.timestamp > dateadd(day,-30,getdate())`, { userId });
    const partsClicks = partsClicksResult[0].clicks || 0;

    metrics.push({ 
        title: 'Parts Overview', 
        value: `Parts : ${partsCount}<br>Clicks : ${partsClicks}`, 
        icon: 'fa-boxes' 
    });

    // Top 3 Categories — exact query and layout you requested
    const topResult = await executeQuery(pool, `
        select distinct top 3 c.MainCategory , count(*) AS Clicks
        from UserFingerprints fp
        join FingerprintCatalogAccess ca on fp.id = ca.fingerprint_id
        join [dbo].[Catalog] c on c.ID = ca.catalog_id
        where user_id = @userId
        and ProductID is not null
        and ca.timestamp > dateadd(day,-30,getdate())
        group by MainCategory
        ORDER BY Clicks DESC`, { userId });

    const list = topResult.length
        ? topResult.map(r => `<li>${r.MainCategory} (${r.Clicks})</li>`).join('')
        : '<li>No data available</li>';
    metrics.push({ title: 'Top 3 Categories', value: `<ul>${list}</ul>`, icon: 'fa-list-ul' });

    return metrics;
}

async function fetchMerchantMetrics(pool, userId) {
    const metrics = [];

    const allKeys = await executeQuery(pool,
        `SELECT COUNT(*) as total, 
                SUM(CASE WHEN LastStatus NOT IN (0, 200) THEN 1 ELSE 0 END) as bad 
         FROM UserApiKeys 
         WHERE user_id = @userId`, { userId });

    const total = allKeys[0].total || 0;
    const bad = allKeys[0].bad || 0;

    let valueHtml = '';

    if (total === 0) {
        valueHtml = `No keys found. <a href="/apikey.html">Set up your store link here.</a>`;
    } else {
        valueHtml = `Valid keys : ${total - bad}<br>`;
        if (bad > 0) {
            valueHtml += `<a href="/apikey.html">Warning: ${bad} keys need attention</a>`;
        }
    }

    metrics.push({
        title: 'API Key Status',
        value: valueHtml,
        icon: bad > 0 ? 'fa-exclamation-triangle' : 'fa-check'
    });

    return metrics;
}

async function fetchPartnerMetrics(pool, userId) {
    // MERGED INTO SINGLE "Onboarding" CARD + FIRST OF MONTH FILTER
    const result = await executeQuery(pool, `
        SELECT 
            SUM(CASE WHEN role = 'merchant' THEN 1 ELSE 0 END) as merchantSignups,
            SUM(CASE WHEN role = 'community' THEN 1 ELSE 0 END) as communitySignups
        FROM Users 
        WHERE referrer = @userId 
          AND created_at >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)`, { userId });

    const valueHtml = `Merchants : ${result[0].merchantSignups || 0}<br>Communities : ${result[0].communitySignups || 0}`;

    return [{ 
        title: 'Onboarding', 
        value: valueHtml, 
        icon: 'fa-user-plus' 
    }];
}

async function fetchAdminMetrics(pool) {
    // MERGED INTO SINGLE "Total Onboarding" CARD + FIRST OF MONTH FILTER
    const result = await executeQuery(pool, `
        SELECT 
            SUM(CASE WHEN role = 'merchant' THEN 1 ELSE 0 END) as merchantSignups,
            SUM(CASE WHEN role = 'community' THEN 1 ELSE 0 END) as communitySignups
        FROM Users 
        WHERE created_at >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0)`);

    const valueHtml = `Merchants : ${result[0].merchantSignups || 0}<br>Communities : ${result[0].communitySignups || 0}`;

    return [{ 
        title: 'Total Onboarding', 
        value: valueHtml, 
        icon: 'fa-user-plus' 
    }];
}