// nodejs/helpers.js
// Central orchestrator for the Madeira shared layer.
// All consumers should import from this file.

const winston = require('winston');
const sql = require('mssql');
const bcrypt = require('bcrypt');

// AWS SDK
const { 
    S3Client, 
    GetObjectCommand, 
    PutObjectCommand, 
    ListObjectsV2Command,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
    CopyObjectCommand 
} = require("@aws-sdk/client-s3");

const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { SSMClient, GetParametersCommand, PutParameterCommand } = require("@aws-sdk/client-ssm");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

// Logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()],
    defaultMeta: { service: 'madeira-shared-layer' }
});

logger.debug('Shared Layer orchestrator loaded');

// AWS Region
const BOOTSTRAP_REGION = process.env.AWS_REGION || 'eu-west-2';

let awsRegionCache = null;
let awsRegionCacheTime = 0;

async function getAwsRegion() {
    const now = Date.now();
    if (awsRegionCache && (now - awsRegionCacheTime < 1800000)) return awsRegionCache;

    try {
        let region = process.env.AWS_REGION || BOOTSTRAP_REGION;

        const client = new SSMClient({ region: BOOTSTRAP_REGION });
        const response = await client.send(
            new GetParametersCommand({ Names: ["/madeira/aws-region"], WithDecryption: true })
        );

        const ssmRegion = response.Parameters?.[0]?.Value;
        if (ssmRegion) region = ssmRegion;

        awsRegionCache = region;
        awsRegionCacheTime = now;
        return region;

    } catch (error) {
        logger.warn('Failed to check SSM region override, using bootstrap', { error: error.message });
        awsRegionCache = BOOTSTRAP_REGION;
        awsRegionCacheTime = now;
        return BOOTSTRAP_REGION;
    }
}

// Shared AWS Clients
let s3ClientCache = null, s3RegionCache = null;
let sqsClientCache = null, sqsRegionCache = null;
let ssmClientCache = null, ssmRegionCache = null;
let lambdaClientCache = null, lambdaRegionCache = null;

async function getS3Client() {
    const region = await getAwsRegion();
    if (s3ClientCache && s3RegionCache === region) return s3ClientCache;
    s3ClientCache = new S3Client({ region });
    s3RegionCache = region;
    return s3ClientCache;
}

async function getSQSClient() {
    const region = await getAwsRegion();
    if (sqsClientCache && sqsRegionCache === region) return sqsClientCache;
    sqsClientCache = new SQSClient({ region });
    sqsRegionCache = region;
    return sqsClientCache;
}

async function getSSMClient() {
    const region = await getAwsRegion();
    if (ssmClientCache && ssmRegionCache === region) return ssmClientCache;
    ssmClientCache = new SSMClient({ region });
    ssmRegionCache = region;
    return ssmClientCache;
}

async function getLambdaClient() {
    const region = await getAwsRegion();
    if (lambdaClientCache && lambdaRegionCache === region) return lambdaClientCache;
    lambdaClientCache = new LambdaClient({ region });
    lambdaRegionCache = region;
    return lambdaClientCache;
}

// SSM Helper
async function createPlaceholderIfMissing(client, name, placeholder = "CHANGE_ME") {
    try {
        await client.send(new PutParameterCommand({
            Name: name,
            Value: placeholder,
            Type: "String",
            Overwrite: true
        }));
        return placeholder;
    } catch (err) {
        logger.error(`Failed to create placeholder for ${name}`, { error: err.message });
        return placeholder;
    }
}

// Bcrypt
async function hashPassword(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Password is required and must be a string');
    }
    return bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
    if (!password || typeof password !== 'string' || !hash || typeof hash !== 'string') {
        throw new Error('Both password and hash are required and must be strings');
    }
    return bcrypt.compare(password, hash);
}

// ====================== BODY PARSING HELPER ======================
function parseBody(event) {
    if (!event || !event.body) {
        return {};
    }

    try {
        if (event.isBase64Encoded) {
            const decoded = Buffer.from(event.body, 'base64').toString('utf8');
            return JSON.parse(decoded);
        }
        if (typeof event.body === 'object') {
            return event.body;
        }
        return JSON.parse(event.body);
    } catch (err) {
        logger.warn('Failed to parse request body', { error: err.message });
        return {};
    }
}

// SQS
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

async function enqueueMessage(message, options = {}) {
    if (!SQS_QUEUE_URL) throw new Error('SQS_QUEUE_URL environment variable is not set');
    if (!message || typeof message !== 'object') throw new Error('enqueueMessage requires a valid message object');

    const isFifoQueue = SQS_QUEUE_URL.toLowerCase().endsWith('.fifo');

    const params = {
        QueueUrl: SQS_QUEUE_URL,
        MessageBody: JSON.stringify(message)
    };

    if (isFifoQueue) {
        params.MessageGroupId = options.messageGroupId || message.userId || message.catalogId || message.type || 'default';
        params.MessageDeduplicationId = options.deduplicationId || `${message.userId || message.catalogId || 'default'}-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
    }

    const sqs = await getSQSClient();
    await sqs.send(new SendMessageCommand(params));
    return { success: true };
}

// ====================== S3 BUCKET ======================
const S3_BUCKET = process.env.S3_BUCKET || 'madeira-screenshots';

// ====================== S3 UPLOAD HELPERS ======================

async function uploadBase64ToS3(base64Data, key, contentType = 'image/png') {
    if (!base64Data || !key) throw new Error('base64Data and key are required');

    try {
        const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(base64String, 'base64');

        const s3 = await getS3Client();
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'max-age=31536000'
        }));

        const region = await getAwsRegion();
        return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;
    } catch (error) {
        logger.error('S3 upload failed', { key, error: error.message });
        throw new Error(`Failed to upload to S3: ${error.message}`);
    }
}

async function uploadBufferToS3(buffer, key, contentType = 'application/octet-stream') {
    if (!buffer || !key) throw new Error('buffer and key are required');

    try {
        const s3 = await getS3Client();
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'max-age=31536000'
        }));

        const region = await getAwsRegion();
        return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;
    } catch (error) {
        logger.error('S3 buffer upload failed', { key, error: error.message });
        throw new Error(`Failed to upload buffer to S3: ${error.message}`);
    }
}

// ====================== S3 DELETE HELPERS ======================

async function deleteFromS3(key, bucket = null) {
    if (!key) throw new Error('key is required');

    const targetBucket = bucket || S3_BUCKET;

    try {
        const s3 = await getS3Client();
        await s3.send(new DeleteObjectCommand({ Bucket: targetBucket, Key: key }));
        logger.debug('S3 object deleted', { key, bucket: targetBucket });
        return true;
    } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return true;
        }
        logger.error('Failed to delete from S3', { key, error: error.message });
        throw error;
    }
}

async function deleteMultipleFromS3(keys, bucket = null) {
    if (!Array.isArray(keys) || keys.length === 0) return true;

    const targetBucket = bucket || S3_BUCKET;
    const s3 = await getS3Client();

    const objects = keys.map(key => ({ Key: key }));

    await s3.send(new DeleteObjectsCommand({
        Bucket: targetBucket,
        Delete: { Objects: objects }
    }));

    return true;
}

// ====================== S3 REPLACE HELPERS ======================

async function replaceFileInS3(oldKey, newBase64Data, newKey = null, contentType = 'image/png') {
    if (!oldKey || !newBase64Data) throw new Error('oldKey and newBase64Data are required');

    const targetKey = newKey || oldKey;

    try {
        if (oldKey !== targetKey) {
            await deleteFromS3(oldKey);
        }
        return await uploadBase64ToS3(newBase64Data, targetKey, contentType);
    } catch (error) {
        logger.error('Failed to replace file in S3', { oldKey, newKey: targetKey, error: error.message });
        throw new Error(`Failed to replace file in S3: ${error.message}`);
    }
}

async function replaceBufferInS3(oldKey, newBuffer, newKey = null, contentType = 'image/png') {
    if (!oldKey || !newBuffer) throw new Error('oldKey and newBuffer are required');

    const targetKey = newKey || oldKey;

    try {
        if (oldKey !== targetKey) {
            await deleteFromS3(oldKey);
        }
        return await uploadBufferToS3(newBuffer, targetKey, contentType);
    } catch (error) {
        logger.error('Failed to replace buffer in S3', { oldKey, newKey: targetKey, error: error.message });
        throw new Error(`Failed to replace buffer in S3: ${error.message}`);
    }
}

// ====================== FINAL RE-EXPORTS ======================
module.exports = {
    sql,
    logger,
    getAwsRegion,
    getS3Client,
    getSQSClient,
    getLambdaClient,
    getSSMClient,
    InvokeCommand,
    GetObjectCommand,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
    CopyObjectCommand,
    GetParametersCommand,
    SendMessageCommand,
    enqueueMessage,
    hashPassword,
    comparePassword,
    createPlaceholderIfMissing,
    parseBody,

    // S3 Helpers
    uploadBase64ToS3,
    uploadBufferToS3,
    deleteFromS3,
    deleteMultipleFromS3,
    replaceFileInS3,
    replaceBufferInS3
};

// ====================== IMPORT CONFIG MODULES ======================
const dbConfig = require('./conf/db-config');
const grokConfig = require('./conf/grok-config');
const mailerConfig = require('./conf/mailer-config');
const smsConfig = require('./conf/sms-config');
const jwtConfig = require('./conf/jwt-config');
const stripeConfig = require('./conf/stripe-config');
const ebayConfig = require('./conf/ebay-config');
const amazonConfig = require('./conf/amazon-config');
const awinConfig = require('./conf/awin-config');
const incentiveConfig = require('./conf/incentive-config');

// ====================== DATABASE POOL + RETRY EXPORTS ======================
Object.assign(module.exports, {
    getDbPool: dbConfig.getDbPool,
    getDbConnection: dbConfig.getDbPool,
    getDbConfig: dbConfig.getDbConfig,
    getGrokConfig: grokConfig.getGrokConfig,
    getMailerConfig: mailerConfig.getMailerConfig,
    getSmsConfig: smsConfig.getSmsConfig,
    getJwtConfig: jwtConfig.getJwtConfig,
    getStripeConfig: stripeConfig.getStripeConfig,
    getEbayConfig: ebayConfig.getEbayConfig,
    getAwinConfig: awinConfig.getAwinConfig,
    getIncentiveConfig: incentiveConfig.getIncentiveConfig,
    executeWithRetry: dbConfig.executeWithRetry
});