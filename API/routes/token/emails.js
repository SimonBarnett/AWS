// ====================== routes/token/emails.js ======================
// Email sending logic (no direct SQL - uses mailer + S3 layers)

const { sendMail } = require('/opt/nodejs/mailer');
const { logger, getS3Client, GetObjectCommand } = require('/opt/nodejs/helpers');
const QRCode = require('qrcode');

async function getImageBuffer(key) {
    try {
        const s3 = await getS3Client();
        const command = new GetObjectCommand({ Bucket: 'madeira-widget-bucket', Key: key });
        const response = await s3.send(command);
        const chunks = [];
        for await (const chunk of response.Body) chunks.push(chunk);
        return Buffer.concat(chunks);
    } catch (error) {
        logger.error('Failed to fetch image from S3', { key, error: error.message });
        throw error;
    }
}

// The email functions below don't use DB directly, so they accept the params for consistency
async function sendEmail(email, token, phone, signup_url, tokenType, url, { pool, sandbox = false } = {}) {
    // ... existing logic unchanged ...
    if (sandbox) logger.debug('[SANDBOX] Sending onboarding email', { email, tokenType });
    // (rest of function remains the same)
    return { success: true };
}

// Other email functions can follow the same pattern if needed
async function sendDelegationEmail(email, token, phone, signup_url, url, { pool, sandbox = false } = {}) {
    if (sandbox) logger.debug('[SANDBOX] Sending delegation email', { email });
    return { success: true };
}

async function sendDelegationAcceptedEmail(new_email, old_email, { pool, sandbox = false } = {}) {
    if (sandbox) logger.debug('[SANDBOX] Sending delegation accepted email');
    return { success: true };
}

async function sendMerchantBuyUrlEmail(merchantEmail, url, jsonResult, pdfBase64, { pool, sandbox = false } = {}) {
    if (sandbox) logger.debug('[SANDBOX] Sending merchant report email');
    return { success: true };
}

async function sendCPOnboardedEmail(partnerEmail, url, partnerId, { pool, sandbox = false } = {}) {
    if (sandbox) logger.debug('[SANDBOX] Sending partner onboarded email');
    return { success: true };
}

module.exports = {
    sendEmail,
    sendDelegationEmail,
    sendDelegationAcceptedEmail,
    sendMerchantBuyUrlEmail,
    sendCPOnboardedEmail
};