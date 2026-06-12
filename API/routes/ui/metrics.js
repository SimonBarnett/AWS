// ====================== routes/ui/metrics.js ======================
// Full original logic restored + adapted to pool + executeWithRetry

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

    const catResult = await executeQuery(pool,
        'SELECT COUNT(DISTINCT MainCategory) as count FROM Catalog WHERE UserId = @userId',
        { userId });
    metrics.push({ title: 'Number of Categories', value: catResult[0].count, icon: 'fa-list-alt' });

    const partsResult = await executeQuery(pool,
        'SELECT COUNT(*) as count FROM Products WHERE UserId = @userId',
        { userId });
    metrics.push({ title: 'Number of Parts', value: partsResult[0].count, icon: 'fa-boxes' });

    const popularResult = await executeQuery(pool, `
        SELECT TOP 3 SubCategory, COUNT(*) as Clicks 
        FROM DatabaseCallLog 
        WHERE UserId = @userId 
          AND Timestamp >= DATEADD(day, -7, GETDATE()) 
          AND SubCategory IS NOT NULL
        GROUP BY SubCategory 
        ORDER BY Clicks DESC`, { userId });

    const list = popularResult.length
        ? popularResult.map(r => `<li>${r.SubCategory} (${r.Clicks})</li>`).join('')
        : '<li>No data available</li>';
    metrics.push({ title: 'Top 3 Popular Subcategories (Last 7 Days)', value: `<ul>${list}</ul>`, icon: 'fa-list-ul' });

    return metrics;
}

async function fetchMerchantMetrics(pool, userId) {
    const metrics = [];

    const badKeys = await executeQuery(pool,
        `SELECT COUNT(*) as count FROM UserApiKeys 
         WHERE user_id = @userId AND LastStatus NOT IN (0, 200)`, { userId });
    const count = badKeys[0].count;
    metrics.push({
        title: 'API Key Status',
        value: count > 0 ? `Warning: ${count} invalid keys` : 'All keys valid',
        icon: count > 0 ? 'fa-exclamation-triangle' : 'fa-check'
    });

    const [uploaded, listed] = await Promise.all([
        executeQuery(pool, 'SELECT COUNT(*) as count FROM MerchantProducts WHERE UserId = @userId', { userId }),
        executeQuery(pool, 'SELECT COUNT(*) as count FROM MerchantCatalog WHERE MerchantID = @userId', { userId })
    ]);

    metrics.push({
        title: 'Parts Uploaded vs Listed',
        value: `Uploaded: ${uploaded[0].count} / Listed: ${listed[0].count}`,
        icon: 'fa-boxes'
    });

    return metrics;
}

async function fetchPartnerMetrics(pool, userId) {
    const result = await executeQuery(pool, `
        SELECT 
            SUM(CASE WHEN role = 'merchant' THEN 1 ELSE 0 END) as merchantSignups,
            SUM(CASE WHEN role = 'community' THEN 1 ELSE 0 END) as communitySignups
        FROM Users 
        WHERE referrer = @userId 
          AND created_at >= DATEADD(day, -7, GETDATE())`, { userId });

    return [
        { title: 'Merchant Signups (Last 7 Days)', value: result[0].merchantSignups || 0, icon: 'fa-user-plus' },
        { title: 'Community Signups (Last 7 Days)', value: result[0].communitySignups || 0, icon: 'fa-user-plus' }
    ];
}

async function fetchAdminMetrics(pool) {
    const result = await executeQuery(pool, `
        SELECT 
            SUM(CASE WHEN role = 'merchant' THEN 1 ELSE 0 END) as merchantSignups,
            SUM(CASE WHEN role = 'community' THEN 1 ELSE 0 END) as communitySignups
        FROM Users 
        WHERE created_at >= DATEADD(day, -7, GETDATE())`);

    return [
        { title: 'Total Merchant Signups (Last 7 Days)', value: result[0].merchantSignups || 0, icon: 'fa-user-plus' },
        { title: 'Total Community Signups (Last 7 Days)', value: result[0].communitySignups || 0, icon: 'fa-user-plus' }
    ];
}