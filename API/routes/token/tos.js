// ====================== routes/token/tos.js ======================
// Serves Terms of Service from S3 based on token or service type

const { logger, getS3Client, GetObjectCommand, executeWithRetry, sql, parseBody } = require('/opt/nodejs/helpers');

// ====================== HELPERS ======================

const streamToString = (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
};

/**
 * Resolve the ToS type from an onboarding token
 */
async function resolveTokenType(onboardingToken, pool) {
    if (!onboardingToken) return null;

    try {
        const result = await executeWithRetry(() =>
            pool.request()
                .input('token_id', sql.VarChar(512), onboardingToken)
                .query('SELECT tokenType FROM Tokens WHERE token_id = @token_id')
        );

        if (result.recordset.length === 0) {
            return { error: { statusCode: 404, message: 'Token not found' } };
        }

        return { type: result.recordset[0].tokenType };
    } catch (err) {
        logger.error('Error looking up token type', { onboardingToken, error: err.message });
        return { error: { statusCode: 500, message: 'Error validating token' } };
    }
}

/**
 * Map service/token type to the correct S3 key
 */
function getTosS3Key(type) {
    const keyMap = {
        partner: 'partner_tos.txt',
        community: 'community_tos.txt',
        merchant: 'merchant_tos.txt'
    };

    return keyMap[type] || null;
}

// ====================== MAIN HANDLER ======================

module.exports = async (event, { pool, sandbox = false } = {}) => {
    const queryParams = event.queryStringParameters || {};
    const onboardingToken = queryParams.token || null;
    const service = queryParams.service || null;

    if (!onboardingToken && !service) {
        return {
            statusCode: 400,
            body: { status: 'error', error_message: 'Token or service is required' }
        };
    }

    // Resolve type (from token or direct service param)
    let type = service;

    if (onboardingToken) {
        const tokenResult = await resolveTokenType(onboardingToken, pool);

        if (tokenResult?.error) {
            return {
                statusCode: tokenResult.error.statusCode,
                body: { status: 'error', error_message: tokenResult.error.message }
            };
        }
        type = tokenResult.type;
    }

    // Get S3 key for this type
    const key = getTosS3Key(type);
    if (!key) {
        return {
            statusCode: 400,
            body: { status: 'error', error_message: 'Invalid tokenType or service' }
        };
    }

    // Get bucket from environment
    const bucket = process.env.TOS_BUCKET;
    if (!bucket) {
        logger.error('TOS_BUCKET environment variable is not set');
        return {
            statusCode: 500,
            body: { status: 'error', error_message: 'TOS bucket not configured' }
        };
    }

    // Fetch ToS from S3
    try {
        const s3 = await getS3Client();
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });

        const response = await s3.send(command);
        const text = await streamToString(response.Body);

        if (sandbox) {
            logger.debug('[SANDBOX] ToS served from S3', { type, key });
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: text
        };
    } catch (err) {
        logger.error('Error fetching terms from S3', { bucket, key, error: err.message });
        return {
            statusCode: 500,
            body: { status: 'error', error_message: 'Error fetching terms' }
        };
    }
};