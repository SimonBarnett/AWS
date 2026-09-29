// ====================== routes/ui/chartData.js ======================
// Full original logic restored + adapted to new pool + executeWithRetry 
// + COMMUNITY REPORTS RENAMED AND REMAPPED EXACTLY AS REQUESTED 
// + ADMIN VIEWS REPLACED WITH NETWORK-WIDE TOTALS 
// + MERCHANT SIMPLIFIED TO SINGLE PRODUCT CLICKS GRAPH RENAMED TO 'My Product Clicks'
// + ROLE + REPORT DATA RETURNED FOR WIDGET (WITH ICONS)

const { logger, executeWithRetry, sql } = require('/opt/nodejs/helpers');

// ====================== ICON MAPPINGS ======================

const roleIcons = {
    admin:     'fa-shield-alt',
    merchant:  'fa-user-tie',
    community: 'fa-people-group',
    partner:   'fa-handshake'
};

const reportIcons = {
    // Community reports
    'Catalogue Views':     'fa-eye',
    'Catalogue Clicks':    'fa-mouse-pointer',
    'Catalogue Visitors':  'fa-users',

    // Merchant reports
    'My Product Clicks':   'fa-mouse-pointer',

    // Partner reports
    'Total Views':         'fa-eye',
    'Total Clicks':        'fa-mouse-pointer',
    'Total Visitors':      'fa-users',

    // Admin / Network reports
    'Network Views':       'fa-eye',
    'Network Clicks':      'fa-mouse-pointer',
    'Network Visitors':    'fa-users'
};

// ====================== PERMITTED VIEWS BY ROLE ======================

const permittedViews = {
    admin: [
        'Network Views',
        'Network Clicks',
        'Network Visitors'
    ],
    merchant: [
        'My Product Clicks'
    ],
    community: [
        'Catalogue Views',
        'Catalogue Clicks',
        'Catalogue Visitors'
    ],
    partner: [
        'Total Views',
        'Total Clicks',
        'Total Visitors'
    ]
};

// ====================== MAIN HANDLER ======================

module.exports = async (event, { pool, sandbox = false } = {}) => {
    try {
        logger.debug('Received event', { event });

        const decoded = event.decoded;
        const userId = decoded.user_id;
        const permissions = decoded.permissions || [];

        // Desired display order: community → merchant → partner → admin
        const roleOrder = ['community', 'merchant', 'partner', 'admin'];

        // Filter to only roles the user actually has, then sort by desired order
        const userRoles = permissions.filter(role => ['admin', 'merchant', 'community', 'partner'].includes(role));
        const roles = userRoles.sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b));

        if (roles.length === 0) {
            return { statusCode: 403, body: { message: 'Forbidden: No valid roles' } };
        }

        // Build roles with icons (now in correct order)
        const rolesWithIcons = roles.map(role => ({
            name: role,
            icon: roleIcons[role] || 'fa-user'
        }));

        // ====================== ROLE FILTERING SUPPORT ======================
        const queryParams = event.queryStringParameters || {};
        const selectedRole = queryParams.role ? decodeURIComponent(queryParams.role).trim().toLowerCase() : null;

        let activeRoles = roles;
        if (selectedRole && roles.includes(selectedRole)) {
            activeRoles = [selectedRole];
        }

        // Get permitted views for the active role(s)
        const viewNames = [...new Set(activeRoles.flatMap(role => permittedViews[role] || []))];

        // Build permittedViews with icons
        const permittedViewsWithIcons = viewNames.map(name => ({
            name: name,
            icon: reportIcons[name] || 'fa-chart-bar'
        }));

        const granularity = decodeURIComponent(queryParams.granularity || '').trim().toLowerCase();
        let report_type = decodeURIComponent(queryParams.report_type || '').trim();

        if (!report_type || !viewNames.includes(report_type)) {
            if (viewNames.length > 0) {
                report_type = viewNames[0];
            } else {
                return { statusCode: 403, body: { message: 'Forbidden: No permitted reports available' } };
            }
        }

        if (!granularity) {
            return { statusCode: 400, body: { message: 'Missing required parameter: granularity' } };
        }

        const validGranularities = ['day', 'week', 'month'];
        if (!validGranularities.includes(granularity)) {
            return { statusCode: 400, body: { message: `Invalid granularity: ${granularity}` } };
        }

        const today = new Date();
        const bstOffset = 1 * 60 * 60 * 1000;
        today.setTime(today.getTime() + bstOffset);
        today.setHours(0, 0, 0, 0);

        let periods = {};
        let labels = [];

        if (granularity === 'day') {
            const currentWeek = [];
            for (let i = 6; i >= 0; i--) {
                const dayStart = new Date(today); dayStart.setDate(today.getDate() - i);
                const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
                currentWeek.push({ start: dayStart, end: dayEnd });
                labels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short' }));
            }
            const lastWeek = [];
            for (let i = 13; i >= 7; i--) {
                const dayStart = new Date(today); dayStart.setDate(today.getDate() - i);
                const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
                lastWeek.push({ start: dayStart, end: dayEnd });
            }
            const twoWeeksAgo = [];
            for (let i = 20; i >= 14; i--) {
                const dayStart = new Date(today); dayStart.setDate(today.getDate() - i);
                const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
                twoWeeksAgo.push({ start: dayStart, end: dayEnd });
            }
            periods = { current: currentWeek, currentMinus1: lastWeek, currentMinus2: twoWeeksAgo };
        } else if (granularity === 'week') {
            const currentWeeks = [];
            for (let i = 11; i >= 0; i--) {
                const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay() - i * 7);
                const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
                currentWeeks.push({ start: weekStart, end: weekEnd });
                labels.push(`Week ${getWeekNumber(weekStart)}`);
            }
            const last12Weeks = [];
            for (let i = 23; i >= 12; i--) {
                const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay() - i * 7);
                const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
                last12Weeks.push({ start: weekStart, end: weekEnd });
            }
            const twoBefore12Weeks = [];
            for (let i = 35; i >= 24; i--) {
                const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay() - i * 7);
                const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
                twoBefore12Weeks.push({ start: weekStart, end: weekEnd });
            }
            periods = { current: currentWeeks, currentMinus1: last12Weeks, currentMinus2: twoBefore12Weeks };
        } else if (granularity === 'month') {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const currentMonths = [];
            for (let i = 11; i >= 0; i--) {
                const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0); monthEnd.setHours(23, 59, 59, 999);
                currentMonths.push({ start: monthStart, end: monthEnd });
                labels.push(monthNames[monthStart.getMonth()]);
            }
            const lastYear = [];
            for (let i = 11; i >= 0; i--) {
                const monthStart = new Date(today.getFullYear() - 1, today.getMonth() - i, 1);
                const monthEnd = new Date(today.getFullYear() - 1, today.getMonth() - i + 1, 0); monthEnd.setHours(23, 59, 59, 999);
                lastYear.push({ start: monthStart, end: monthEnd });
            }
            const twoYearsAgo = [];
            for (let i = 11; i >= 0; i--) {
                const monthStart = new Date(today.getFullYear() - 2, today.getMonth() - i, 1);
                const monthEnd = new Date(today.getFullYear() - 2, today.getMonth() - i + 1, 0); monthEnd.setHours(23, 59, 59, 999);
                twoYearsAgo.push({ start: monthStart, end: monthEnd });
            }
            periods = { current: currentMonths, currentMinus1: lastYear, currentMinus2: twoYearsAgo };
        }

        // Query data using passed pool + executeWithRetry + NEW FINGERPRINT TABLES WHERE APPLICABLE
        const currentData = await Promise.all(periods.current.map(period =>
            queryDatabase(pool, report_type, userId, period.start, period.end, granularity)
        ));
        const currentMinus1Data = await Promise.all(periods.currentMinus1.map(period =>
            queryDatabase(pool, report_type, userId, period.start, period.end, granularity)
        ));
        const currentMinus2Data = await Promise.all(periods.currentMinus2.map(period =>
            queryDatabase(pool, report_type, userId, period.start, period.end, granularity)
        ));

        const currentCounts = currentData.map(result => result[0]?.count || 0);
        const currentMinus1Counts = currentMinus1Data.map(result => result[0]?.count || 0);
        const currentMinus2Counts = currentMinus2Data.map(result => result[0]?.count || 0);

        const response = {
            roles: rolesWithIcons,                    // ← ROLES + ICONS FOR RADIO
            permittedViews: permittedViewsWithIcons,  // ← REPORTS + ICONS FOR RADIO
            chartData: {
                labels,
                datasets: [
                    { label: 'Current', data: currentCounts, backgroundColor: '#007bff', borderColor: '#007bff', borderWidth: 1 },
                    { label: 'Current-1', data: currentMinus1Counts, backgroundColor: '#c0c0c0', borderColor: '#c0c0c0', borderWidth: 1 },
                    { label: 'Current-2', data: currentMinus2Counts, backgroundColor: '#d3d3d3', borderWidth: 1 }
                ]
            }
        };

        if (sandbox) logger.debug('[SANDBOX] chartData generated', { report_type, granularity, userId });

        return { statusCode: 200, body: response };

    } catch (error) {
        logger.error('Error retrieving chart data', { error: error.message });
        return { statusCode: 500, body: { message: error.message || 'Internal server error' } };
    }
};

// ====================== HELPER FUNCTIONS ======================

async function queryDatabase(pool, reportType, userId, start, end, granularity) {
    let query;
    switch (reportType) {
        case 'Catalogue Views':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @userId 
                  AND ca.ProductID IS NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Catalogue Clicks':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @userId 
                  AND ca.ProductID IS NOT NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Catalogue Visitors':
            query = `
                SELECT COUNT(DISTINCT fp.fingerprint_hash) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @userId 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'My Product Clicks':
            query = `
                SELECT COUNT(*) as count 
                FROM dbo.MerchantProducts mp 
                INNER JOIN dbo.Products p ON mp.ASIN = p.ASIN AND mp.Source = p.Source 
                INNER JOIN dbo.FingerprintCatalogAccess fca ON fca.ProductID = p.ID 
                WHERE (fca.ProductID IS NOT NULL) 
                  AND (mp.UserId = @userId) 
                  AND fca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Referral Clicks on my Store':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @userId 
                  AND ca.ProductID IS NOT NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Product Views on my Store':
            query = `
                SELECT COUNT(DISTINCT fp.fingerprint_hash) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @userId 
                  AND ca.ProductID IS NOT NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Total Views':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id IN (SELECT user_id FROM Users WHERE referrer = @userId) 
                  AND ca.ProductID IS NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Total Clicks':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id IN (SELECT user_id FROM Users WHERE referrer = @userId) 
                  AND ca.ProductID IS NOT NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Total Visitors':
            query = `
                SELECT COUNT(DISTINCT fp.fingerprint_hash) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id IN (SELECT user_id FROM Users WHERE referrer = @userId) 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Network Views':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                WHERE ca.ProductID IS NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Network Clicks':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                WHERE ca.ProductID IS NOT NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;
        case 'Network Visitors':
            query = `
                SELECT COUNT(DISTINCT fp.fingerprint_hash) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE ca.timestamp BETWEEN @start AND @end
            `;
            break;

        default:
            throw new Error('Invalid report type');
    }

    const result = await executeWithRetry(() =>
        pool.request()
            .input('start', sql.DateTime, start)
            .input('end', sql.DateTime, end)
            .input('userId', sql.VarChar, userId)
            .query(query)
    );

    return result.recordset;
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNum;
}