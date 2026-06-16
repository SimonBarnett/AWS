// API/routes/token/tos.js

const { logger, getDbConnection, sql } = require('/opt/nodejs/helpers');
const { getS3Client, GetObjectCommand } = require('/opt/nodejs/helpers');

async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

module.exports = async (event) => {
    const token = event.queryStringParameters?.token;
    const service = event.queryStringParameters?.service;

    let tokenType = service;

    // Query SystemOTPs to find the tokenType
    if (!tokenType && token) {
        const pool = await getDbConnection();
        try {
            const result = await pool.request()
                .input('token', sql.NVarChar(500), token)
                .query(`
                    SELECT TOP 1 
                        JSON_VALUE(payload, '$.tokenType') AS tokenType
                    FROM SystemOTPs
                    WHERE token_type = 'onboarding'
                      AND expires_at > GETDATE()
                      AND payload LIKE '%' + @token + '%'
                `);

            if (result.recordset.length > 0) {
                tokenType = result.recordset[0].tokenType;
            }
        } catch (err) {
            console.error('tos.js DB error:', err.message);
            return { statusCode: 500, body: JSON.stringify({ status: 'error', error_message: 'Database error' }) };
        }
        // Pool intentionally not closed
    }

    if (!tokenType) {
        return { statusCode: 404, body: JSON.stringify({ status: 'error', error_message: 'Invalid or expired token' }) };
    }

    const s3KeyMap = {
        partner: 'partner_tos.txt',
        community: 'community_tos.txt',
        merchant: 'merchant_tos.txt'
    };

    const s3Key = s3KeyMap[tokenType] || 'partner_tos.txt';

    try {
        const s3 = await getS3Client();
        const command = new GetObjectCommand({
            Bucket: process.env.TOS_BUCKET || 'madeira-widget-bucket',
            Key: s3Key
        });

        const response = await s3.send(command);
        const tosText = await streamToString(response.Body);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: tosText
        };
    } catch (err) {
        logger.error('tos.js S3 error', { key: s3Key, error: err.message });
        return { statusCode: 500, body: JSON.stringify({ status: 'error', error_message: 'Failed to load Terms of Service' }) };
    }
};