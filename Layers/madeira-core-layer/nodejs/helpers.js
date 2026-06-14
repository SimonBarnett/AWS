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

// Bcrypt (clean - removed redundant logging)
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
        params.MessageGroupId = options.messageGroupId 
            || message.userId 
            || message.catalogId 
            || message.type 
            || 'default';

        params.MessageDeduplicationId = options.deduplicationId 
            || `${message.userId || message.catalogId || 'default'}-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
    }

    const sqs = await getSQSClient();
    await sqs.send(new SendMessageCommand(params));
    return { success: true };
}

// ====================== FINAL RE-EXPORTS (MAIN FUNCTIONS FIRST) ======================
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
    createPlaceholderIfMissing
};

// ====================== IMPORT CONFIG MODULES (AFTER MAIN EXPORTS) ======================
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
    executeWithRetry: dbConfig.executeWithRetry     // ← Re-exported here
});