// ====================== nodejs/grok_schemas.js ======================
// Shared JSON schemas for structured Grok output
// Last updated: 11 June 2026

const CATEGORY_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["categories","exclude", "dialog"],
    properties: {
        dialog : { type: "string" },
        exclude: {
            type: "array",
            items: { type: "string" }
        },
        categories: {
            type: "object",
            additionalProperties: false,
            patternProperties: {
                "^[A-Za-z0-9 -]+$": {
                    type: "object",
                    additionalProperties: false,
                    required: ["icon", "MainCategoryOrder", "subcategories"],
                    properties: {
                        icon: {
                            type: "string",
                            pattern: "^(fa-solid|fa-regular|fa-brands) fa-[a-z0-9-]+$"
                        },
                        MainCategoryOrder: {
                            type: "integer",
                            minimum: 1
                        },
                        subcategories: {
                            type: "array",
                            items: {
                                type: "object",
                                additionalProperties: false,
                                required: ["name", "SubCategoryOrder", "searchTerms", "meta"],
                                properties: {
                                    name: { 
                                        type: "string",
                                        pattern: "^[A-Za-z0-9&' -]+$"
                                    },
                                    SubCategoryOrder: {
                                        type: "integer",
                                        minimum: 1
                                    },
                                    searchTerms: {
                                        type: "array",
                                        items: { type: "string" },
                                        minItems: 5,
                                        maxItems: 5
                                    },
                                    meta: {
                                        type: "object",
                                        additionalProperties: false,
                                        required: ["relevantKeywords", "irrelevantKeywords", "notes"],
                                        properties: {
                                            relevantKeywords: {
                                                type: "array",
                                                items: { type: "string" }
                                            },
                                            irrelevantKeywords: {
                                                type: "array",
                                                items: { type: "string" }
                                            },
                                            notes: { type: "string" }
                                        }
                                    }
                                }
                            },
                            minItems: 5,
                            maxItems: 15
                        }
                    }
                }
            },
            minProperties: 6,
            maxProperties: 15
        }
    }
};

// ====================== RESPONSE SCHEMA ======================
const RESPONSE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["name", "location", "sector", "audience", "review", "marketSegments"],
    properties: {
        name: { type: "string" },
        location: { type: "string" },
        sector: { type: "string" },
        audience: { type: "string" },
        email: { type: "string" },
        review: { type: "string" },
        marketSegments: {
            type: "array",
            minItems: 10,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["segmentName", "description"],
                properties: {
                    segmentName: { type: "string" },
                    description: { type: "string" }
                }
            }
        }
    }
};

module.exports = {
    CATEGORY_SCHEMA,
    RESPONSE_SCHEMA
};