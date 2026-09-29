// ====================== nodejs/sms.js ======================
// TextMagic SMS client - uses config from core layer
// Last updated: 02 June 2026

const axios = require('axios');
const { getSmsConfig, logger } = require('/opt/nodejs/helpers');

/**
 * Send an SMS via TextMagic
 * @param {string} phone - Phone number (will be normalized)
 * @param {string} message - Message content
 * @returns {Promise<boolean>} - true if sent successfully
 */
async function sendSmsTextmagic(phone, message) {
    if (!phone || !message) {
        logger.warn('sendSmsTextmagic called with missing phone or message');
        return false;
    }

    const config = await getSmsConfig();

    // Normalize phone number
    let normalizedPhone = phone.replace(/\s/g, '');
    if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+44' + normalizedPhone.slice(1);
    } else if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+44' + normalizedPhone;
    }

    const payload = {
        text: message,
        phones: normalizedPhone
    };

    if (config.TEXTMAGIC_FROM) {
        payload.from = config.TEXTMAGIC_FROM;
    }

    try {
        const response = await axios.post(config.TEXTMAGIC_URL, payload, {
            headers: {
                'X-TM-Username': config.TEXTMAGIC_USERNAME,
                'X-TM-Key': config.TEXTMAGIC_API_KEY
            }
        });

        if (response.status === 201) {
            logger.info('✅ SMS sent successfully via TextMagic', { 
                to: normalizedPhone 
            });
            return true;
        } else {
            logger.error('TextMagic returned non-201 status', { 
                status: response.status 
            });
            return false;
        }
    } catch (error) {
        logger.error('❌ Failed to send SMS via TextMagic', {
            to: normalizedPhone,
            error: error.message,
            responseStatus: error.response?.status,
            responseData: error.response?.data
        });
        return false;
    }
}

module.exports = {
    sendSmsTextmagic
};

logger.info('✅ SMS module loaded (TextMagic via layer config)');