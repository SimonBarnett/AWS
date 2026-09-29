// ====================== routes/ui/clubs.js ======================
// /ui/clubs - Password protected route
// GET  /ui/clubs          → List clubs (admins = all, partners = only their own)
// POST /ui/clubs          → All actions
// Includes full Club-specific ChartData logic (Catalogue Views/Clicks/Visitors)

const { 
    logger, 
    sql, 
    executeWithRetry,
    uploadBase64ToS3,
    replaceFileInS3
} = require('/opt/nodejs/helpers');

// ====================== ICON MAPPINGS (for frontend) ======================
const reportIcons = {
    'Catalogue Views':     'fa-eye',
    'Catalogue Clicks':    'fa-mouse-pointer',
    'Catalogue Visitors':  'fa-users'
};

// ====================== MAIN HANDLER ======================
module.exports = async (event, { pool, sandbox = false }) => {
    const { decoded, httpMethod } = event;

    logger.info('📋 CLUBS ROUTE', { userId: decoded?.user_id, method: httpMethod });

    if (!decoded?.user_id) {
        return { statusCode: 401, body: { status: 'error', error_message: 'Invalid token' } };
    }

    // ====================== PERMISSION CHECK ======================
    const userResult = await pool.request()
        .input('user_id', sql.Char(8), decoded.user_id)
        .query(`SELECT user_id, permissions FROM Users WHERE user_id = @user_id`);

    const user = userResult.recordset[0];
    if (!user) {
        return { statusCode: 404, body: { status: 'error', error_message: 'User not found' } };
    }

    const permissions = user.permissions || [];
    const isAdmin = permissions.includes('admin');
    const isPartner = permissions.includes('partner') || permissions.includes('owner');

    if (!isAdmin && !isPartner) {
        return { statusCode: 403, body: { status: 'error', error_message: 'Forbidden' } };
    }

    // ====================== HANDLE GET REQUEST ======================
    if (httpMethod === 'GET') {
        let query = `SELECT * FROM dbo.clubs()`;

        if (!isAdmin) {
            query += ` WHERE PartnerId = @userId`;
            const result = await executeWithRetry(async () => {
                return await pool.request()
                    .input('userId', sql.Char(8), decoded.user_id)
                    .query(query);
            });
            return { statusCode: 200, body: { status: 'success', clubs: result.recordset } };
        }

        const result = await executeWithRetry(async () => {
            return await pool.request().query(query);
        });
        return { statusCode: 200, body: { status: 'success', clubs: result.recordset } };
    }

    // ====================== HANDLE POST REQUEST ======================
    let body = {};
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch {
        return { statusCode: 400, body: { status: 'error', error_message: 'Invalid JSON' } };
    }

    const { action, clubId, screenshot, comment, granularity, report_type } = body;

    // ====================== ACTION: LIST ======================
    if (!action || action === 'list') {
        let query = `SELECT * FROM dbo.clubs()`;
        const result = await executeWithRetry(async () => {
            return await pool.request().query(query);
        });
        return { statusCode: 200, body: { status: 'success', clubs: result.recordset } };
    }

    // ====================== ACTION: DETAIL ======================
    if (action === 'detail') {
        if (!clubId) {
            return { statusCode: 400, body: { status: 'error', error_message: 'clubId is required' } };
        }

        const result = await executeWithRetry(async () => {
            return await pool.request()
                .input('clubId', sql.VarChar, clubId)
                .query(`SELECT * FROM dbo.clubs() WHERE ClubID = @clubId`);
        });

        if (result.recordset.length === 0) {
            return { statusCode: 404, body: { status: 'error', error_message: 'Club not found' } };
        }

        return { statusCode: 200, body: { status: 'success', club: result.recordset[0] } };
    }

    // ====================== ACTION: UPLOAD SCREENSHOT ======================
    if (action === 'upload-screenshot') {
        if (!clubId || !screenshot) {
            return { statusCode: 400, body: { status: 'error', error_message: 'clubId and screenshot are required' } };
        }

        const clubResult = await pool.request()
            .input('clubId', sql.VarChar, clubId)
            .query(`SELECT PartnerId, Screenshot FROM clubscan WHERE ClubID = @clubId`);

        if (clubResult.recordset.length === 0) {
            return { statusCode: 404, body: { status: 'error', error_message: 'Club not found' } };
        }

        const club = clubResult.recordset[0];

        try {
            const newKey = `screenshots/${clubId}-${Date.now()}.png`;
            let screenshotUrl;

            if (club.Screenshot) {
                const oldKey = club.Screenshot.split('.amazonaws.com/')[1];
                screenshotUrl = await replaceFileInS3(oldKey, screenshot, newKey);
            } else {
                screenshotUrl = await uploadBase64ToS3(screenshot, newKey);
            }

            await executeWithRetry(async () => {
                return await pool.request()
                    .input('clubId', sql.VarChar, clubId)
                    .input('url', sql.NVarChar(500), screenshotUrl)
                    .query(`UPDATE clubscan SET Screenshot = @url WHERE ClubID = @clubId`);
            });

            return { statusCode: 200, body: { status: 'success', message: 'Screenshot uploaded successfully', screenshotUrl } };
        } catch (err) {
            logger.error('Screenshot upload failed', { error: err.message });
            return { statusCode: 500, body: { status: 'error', error_message: 'Failed to upload screenshot' } };
        }
    }

    // ====================== ACTION: SAVE COMMENT ======================
    if (action === 'save-comment') {
        if (!clubId || comment === undefined) {
            return { statusCode: 400, body: { status: 'error', error_message: 'clubId and comment are required' } };
        }

        await executeWithRetry(async () => {
            return await pool.request()
                .input('clubId', sql.VarChar, clubId)
                .input('comment', sql.NVarChar(sql.MAX), comment)
                .query(`UPDATE clubscan SET Comment = @comment WHERE ClubID = @clubId`);
        });

        return { statusCode: 200, body: { status: 'success', message: 'Comment saved successfully' } };
    }

    // ====================== ACTION: PROMOTE ======================
    if (action === 'promote') {
        if (!clubId) {
            return { statusCode: 400, body: { status: 'error', error_message: 'clubId is required' } };
        }

        const clubCheck = await pool.request()
            .input('clubId', sql.VarChar, clubId)
            .query(`SELECT TOP 1 PartnerID FROM dbo.AwinHighApprovalMerchants WHERE ClubID = @clubId`);

        if (clubCheck.recordset.length === 0) {
            return { statusCode: 404, body: { status: 'error', error_message: 'No recommendations found for this club' } };
        }

        const clubPartnerId = clubCheck.recordset[0].PartnerID;

        if (!isAdmin && clubPartnerId !== decoded.user_id) {
            return { statusCode: 403, body: { status: 'error', error_message: 'You do not have permission to view promotions for this club' } };
        }

        const result = await executeWithRetry(async () => {
            return await pool.request()
                .input('clubId', sql.VarChar, clubId)
                .query(`
                    SELECT MerchantId, Name, primarySector, description, logoUrl, PartnerID, ClubID, whyHtml, joinHtml
                    FROM dbo.AwinHighApprovalMerchants
                    WHERE Joined <> 1
                      AND logoUrl IS NOT NULL
                      AND ClubID = @clubId
                    ORDER BY Name
                `);
        });

        return { statusCode: 200, body: { status: 'success', recommendations: result.recordset } };
    }

    // ====================== ACTION: CHARTDATA (CLUB-SPECIFIC) ======================
    if (action === 'chartdata') {
        logger.info('📊 CHARTDATA action started', { clubId, granularity, report_type });

        if (!clubId) {
            return { statusCode: 400, body: { status: 'error', error_message: 'clubId is required' } };
        }

        // Security check
        const clubCheck = await pool.request()
            .input('clubId', sql.VarChar, clubId)
            .query(`SELECT TOP 1 PartnerID FROM clubscan WHERE ClubID = @clubId`);

        if (clubCheck.recordset.length === 0) {
            logger.warn('Club not found in clubscan', { clubId });
            return { statusCode: 404, body: { status: 'error', error_message: 'Club not found' } };
        }

        const clubPartnerId = clubCheck.recordset[0].PartnerID;

        if (!isAdmin && clubPartnerId !== decoded.user_id) {
            logger.warn('Permission denied for chartdata', { clubId, userId: decoded.user_id, clubPartnerId });
            return { statusCode: 403, body: { status: 'error', error_message: 'You do not have permission to view charts for this club' } };
        }

        const validGranularities = ['day', 'week', 'month'];
        const granularityParam = (granularity || 'day').toLowerCase();

        if (!validGranularities.includes(granularityParam)) {
            return { statusCode: 400, body: { status: 'error', error_message: 'Invalid granularity' } };
        }

        const allowedReports = ['Catalogue Views', 'Catalogue Clicks', 'Catalogue Visitors'];
        let reportType = report_type || 'Catalogue Views';

        if (!allowedReports.includes(reportType)) {
            reportType = 'Catalogue Views';
        }

        logger.info('📊 Chart parameters validated', { 
            clubId, 
            granularity: granularityParam, 
            reportType 
        });

        const today = new Date();
        const bstOffset = 1 * 60 * 60 * 1000;
        today.setTime(today.getTime() + bstOffset);
        today.setHours(0, 0, 0, 0);

        let periods = {};
        let labels = [];

        if (granularityParam === 'day') {
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
        } else if (granularityParam === 'week') {
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
        } else if (granularityParam === 'month') {
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

        logger.info('📊 Periods calculated', { 
            granularity: granularityParam, 
            labelCount: labels.length,
            labels 
        });

        // Query data with detailed logging
        const currentData = await Promise.all(periods.current.map(period =>
            queryClubDatabase(pool, reportType, clubId, period.start, period.end)
        ));
        const currentMinus1Data = await Promise.all(periods.currentMinus1.map(period =>
            queryClubDatabase(pool, reportType, clubId, period.start, period.end)
        ));
        const currentMinus2Data = await Promise.all(periods.currentMinus2.map(period =>
            queryClubDatabase(pool, reportType, clubId, period.start, period.end)
        ));

        const currentCounts = currentData.map(result => result[0]?.count || 0);
        const currentMinus1Counts = currentMinus1Data.map(result => result[0]?.count || 0);
        const currentMinus2Counts = currentMinus2Data.map(result => result[0]?.count || 0);

        logger.info('📊 Chart data fetched', {
            reportType,
            currentCounts,
            currentMinus1Counts,
            currentMinus2Counts,
            totalCurrent: currentCounts.reduce((a, b) => a + b, 0)
        });

        const permittedViewsWithIcons = allowedReports.map(name => ({
            name: name,
            icon: reportIcons[name] || 'fa-chart-bar'
        }));

        const response = {
            permittedViews: permittedViewsWithIcons,
            chartData: {
                labels,
                datasets: [
                    { label: 'Current', data: currentCounts, backgroundColor: '#007bff', borderColor: '#007bff', borderWidth: 1 },
                    { label: 'Current-1', data: currentMinus1Counts, backgroundColor: '#c0c0c0', borderColor: '#c0c0c0', borderWidth: 1 },
                    { label: 'Current-2', data: currentMinus2Counts, borderWidth: 1 }
                ]
            }
        };

        logger.info('📊 Final chart response prepared', { 
            labelCount: labels.length,
            hasData: currentCounts.some(c => c > 0)
        });

        return { statusCode: 200, body: response };
    }

    return {
        statusCode: 400,
        body: { status: 'error', error_message: 'Invalid action. Use list, detail, upload-screenshot, save-comment, promote, or chartdata' }
    };
};

// ====================== HELPER: Club-specific query ======================
async function queryClubDatabase(pool, reportType, clubId, start, end) {
    let query;

    switch (reportType) {
        case 'Catalogue Views':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @clubId 
                  AND ca.ProductID IS NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;

        case 'Catalogue Clicks':
            query = `
                SELECT COUNT(*) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @clubId 
                  AND ca.ProductID IS NOT NULL 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;

        case 'Catalogue Visitors':
            query = `
                SELECT COUNT(DISTINCT fp.fingerprint_hash) as count 
                FROM FingerprintCatalogAccess ca 
                JOIN UserFingerprints fp ON ca.fingerprint_id = fp.id 
                WHERE fp.user_id = @clubId 
                  AND ca.timestamp BETWEEN @start AND @end
            `;
            break;

        default:
            throw new Error('Invalid report type for club');
    }

    const result = await executeWithRetry(() =>
        pool.request()
            .input('start', sql.DateTime, start)
            .input('end', sql.DateTime, end)
            .input('clubId', sql.VarChar, clubId)
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