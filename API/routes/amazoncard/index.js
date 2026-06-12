// ====================== routes/amazoncard/index.js ======================
// Amazon Card Claim route only
// Topup logic has been moved to lambdas/amazoncard-topup/

const { sql, logger, getDbConnection } = require('/opt/nodejs/helpers');

module.exports = async (event) => {
    let pool = null;

    try {
        const ipAddress =
            event.requestContext?.identity?.sourceIp ||
            (event.headers?.['x-forwarded-for'] || '').split(',')[0] ||
            'unknown';

        const userAgent =
            event.headers?.['user-agent'] ||
            event.headers?.['User-Agent'] ||
            'unknown';

        let fingerprint =
            event.headers?.['x-fingerprint'] ||
            event.headers?.['X-Fingerprint'] ||
            event.headers?.['fingerprint'];

        if (!fingerprint && event.body) {
            try {
                const body =
                    typeof event.body === 'string'
                        ? JSON.parse(event.body)
                        : event.body;
                fingerprint = body.fingerprint || body.Fingerprint;
            } catch (e) {
                // Ignore parse errors
            }
        }

        pool = await getDbConnection();

        const result = await pool.request()
            .input('ip_address', sql.VarChar(45), ipAddress)
            .input('user_agent', sql.NVarChar(sql.MAX), userAgent)
            .input('fingerprint', sql.NVarChar(255), fingerprint)
            .execute('sp_ClaimVoucher');

        const data = result.recordset?.[0] || {
            success: false,
            httpStatus: 500,
            reason: 'No response from stored procedure'
        };

        return {
            statusCode: data.httpStatus || (data.success ? 200 : 500),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ ...data, operation: 'claim' })
        };

    } catch (error) {
        logger.error('Claim failed', { error: error.message });
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                operation: 'claim',
                reason: 'Internal server error'
            })
        };
    } finally {
        if (pool) {
            await pool.close().catch(() => {});
        }
    }
};