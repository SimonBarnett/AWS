// ====================== routes/amazoncard/index.js ======================
// Amazon Card Claim route
// - Saves optional email against fingerprint in UserFingerprints
// - Calls sp_ClaimVoucher (which now requires a registered email)
// Topup logic has been moved to lambdas/amazoncard-topup/

const { sql, logger, getDbConnection } = require('/opt/nodejs/helpers');
const crypto = require('crypto');

module.exports = async (event) => {
    let pool = null;

    try {
        const ipAddress =
            event.requestContext?.identity?.sourceIp ||
            (event.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim() ||
            'unknown';

        const userAgent =
            event.headers?.['user-agent'] ||
            event.headers?.['User-Agent'] ||
            'unknown';

        // ---------- Parse body once ----------
        let body = {};
        if (event.body) {
            try {
                body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Fingerprint: body → header → fallback hash of IP+UA
        let fingerprint =
            body.fingerprint ||
            body.Fingerprint ||
            event.headers?.['x-fingerprint'] ||
            event.headers?.['X-Fingerprint'] ||
            event.headers?.['fingerprint'];

        if (!fingerprint) {
            fingerprint = crypto.createHash('sha256')
                .update(ipAddress + userAgent)
                .digest('hex');
        }

        // Optional email from the extension
        const email = (body.email || '').trim().toLowerCase() || null;
        const userId = (body.userId || body.affiliate || 'EXTENSION').substring(0, 8);

        pool = await getDbConnection();

        // ---------- If email is present, save it against the fingerprint ----------
        if (email) {
            try {
                await pool.request()
                    .input('fingerprint_hash', sql.VarChar(64), fingerprint)
                    .input('user_id', sql.VarChar(8), userId)
                    .input('email', sql.NVarChar(255), email)
                    .query(`
                        MERGE [dbo].[UserFingerprints] AS t
                        USING (SELECT @fingerprint_hash AS h, @user_id AS u, @email AS e) AS s
                        ON t.fingerprint_hash = s.h
                        WHEN MATCHED THEN 
                            UPDATE SET 
                                email      = COALESCE(s.e, t.email),
                                user_id    = COALESCE(NULLIF(s.u, 'EXTENSION'), t.user_id),
                                updated_at = GETDATE(),
                                Clicks     = ISNULL(t.Clicks, 0) + 1
                        WHEN NOT MATCHED THEN 
                            INSERT (fingerprint_hash, user_id, email, Clicks, total_claims, created_at, updated_at)
                            VALUES (s.h, s.u, s.e, 1, 0, GETDATE(), GETDATE());
                    `);

                logger.info('Email saved against fingerprint', {
                    fingerprint: fingerprint.substring(0, 8) + '...',
                    email: email.substring(0, 3) + '***'
                });
            } catch (mergeErr) {
                // Do not fail the claim if the fingerprint merge fails
                logger.error('Failed to save email against fingerprint', { error: mergeErr.message });
            }
        }

        // ---------- Call the stored procedure ----------
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
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                operation: 'claim',
                reason: 'Internal server error'
            })
        };
    }
};