// ====================== sqs/clubscan-notify.js ======================
// Handles final notification step for Clubscan onboarding
// - Sandbox: Uses only SANDBOX_NOTIFY env var (no partner)
// - Production: Uses NOTIFY env var + partner email
// Emails are MANDATORY — fails the step if no recipients or email fails
// Sets status to 'sending_emails' at start
// Sets status to 'complete' only after email + AWIN succeed (non-sandbox)
// Last updated: 11 June 2026

const {
    logger,
    getLambdaClient,
    InvokeCommand,
    sql
} = require('/opt/nodejs/helpers');

const { sendSuccessEmail } = require('../emails');
const { withStatusHandling, updateStatus } = require('./helpers');

async function handle(event) {
    const { sandbox } = event;

    return withStatusHandling(event, async ({ pool, url }) => {

        const result = await pool.request()
            .input('url', sql.NVarChar, url)
            .query('SELECT * FROM clubscan WHERE Url = @url');

        const row = result.recordset[0];
        if (!row) {
            throw new Error('Clubscan record not found for notification');
        }

        // ====================== DETERMINE RECIPIENTS ======================
        let notificationEmails = [];

        if (sandbox) {
            const sandboxEmail = process.env.SANDBOX_NOTIFY;
            if (sandboxEmail) {
                notificationEmails = [sandboxEmail];
            }
        } else {
            const notifyEmail = process.env.NOTIFY;
            if (notifyEmail) notificationEmails.push(notifyEmail);

            if (row.PartnerId) {
                const partnerEmail = await getPartnerEmail(pool, row.PartnerId);
                if (partnerEmail) notificationEmails.unshift(partnerEmail);
            }
        }

        if (notificationEmails.length === 0) {
            const errorMsg = sandbox 
                ? 'SANDBOX_NOTIFY environment variable is not set' 
                : 'No notification emails configured (NOTIFY + Partner)';
            
            logger.error('No recipients configured for success email', { url, sandbox });
            throw new Error(`No email recipients: ${errorMsg}`);
        }

        // ====================== SEND SUCCESS EMAIL ======================
        logger.info('Sending success email', {
            url,
            recipients: notificationEmails,
            sandbox
        });

        const emailResult = await sendSuccessEmail(notificationEmails, row.ClubID, url);

        if (!emailResult?.success) {
            logger.error('Success email failed to send', { url, recipients: notificationEmails });
            throw new Error('Failed to send success email');
        }

        logger.info('✅ Success email sent', {
            url,
            recipients: notificationEmails,
            sandbox
        });

        // ====================== TRIGGER AWIN REPORT ======================
        let awinTriggered = false;

        try {
            const lambda = await getLambdaClient();

            await lambda.send(new InvokeCommand({
                FunctionName: "madeira-awin-clubscan",
                InvocationType: "Event",
                Payload: JSON.stringify({
                    clubId: row.ClubID,
                    partnerId: row.PartnerId || null,
                    minRelevanceScore: 0.5,
                    notificationEmailTo: notificationEmails
                })
            }));

            logger.info('✅ Triggered AWIN report', { clubId: row.ClubID });
            awinTriggered = true;

        } catch (awinError) {
            logger.error('Failed to trigger AWIN report', {
                clubId: row.ClubID,
                error: awinError.message
            });
        }

        // ====================== SET FINAL STATUS ======================
        if (!sandbox && awinTriggered) {
            await updateStatus(pool, url, 'complete');
        }

        logger.info('✅ Clubscan notification step completed', { url, sandbox });

    }, {
        startStatus: 'sending_emails',        
        successStatus: 'completed'
    });
}

async function getPartnerEmail(pool, partnerId) {
    try {
        const result = await pool.request()
            .input('partnerId', sql.VarChar, partnerId)
            .query('SELECT email_address FROM Users WHERE user_id = @partnerId');
        return result.recordset[0]?.email_address || null;
    } catch {
        return null;
    }
}

module.exports = { handle };