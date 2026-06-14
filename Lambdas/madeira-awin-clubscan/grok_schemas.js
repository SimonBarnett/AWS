// grok-schemas.js
// Centralized Grok / xAI schemas for the awin-clubscan Lambda

const SECTOR_SCHEMA = {
    type: "array",
    items: { type: "string" }
};

const MERCHANT_PERSONALISATION_SCHEMA = {
    type: "array",
    items: {
        type: "object",
        properties: {
            merchantId: { type: "number" },
            merchantName: { type: "string" },
            whyItFits: { type: "string" },
            joinRequestMessage: { type: "string", maxLength: 200 }
        },
        required: ["merchantId", "merchantName", "whyItFits", "joinRequestMessage"],
        additionalProperties: false
    }
};

// Extended version used in club.js (includes relevanceScore)
const MERCHANT_PERSONALISATION_WITH_SCORE_SCHEMA = {
    type: "array",
    items: {
        type: "object",
        properties: {
            merchantId: { type: "number" },
            merchantName: { type: "string" },
            whyItFits: { type: "string" },
            joinRequestMessage: { type: "string", maxLength: 200 },
            relevanceScore: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["merchantId", "merchantName", "whyItFits", "joinRequestMessage", "relevanceScore"],
        additionalProperties: false
    }
};

module.exports = {
    SECTOR_SCHEMA,
    MERCHANT_PERSONALISATION_SCHEMA,
    MERCHANT_PERSONALISATION_WITH_SCORE_SCHEMA
};