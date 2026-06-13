// nodejs/conf/jwt-config.js
const { GetParametersCommand } = require('/opt/nodejs/helpers');
const { getAwsRegion, getSSMClient, createPlaceholderIfMissing, logger } = require('/opt/nodejs/helpers');

let cache = null;
let cacheTime = 0;

async function getJwtConfig() {
    const now = Date.now();
    if (cache && (now - cacheTime < 1800000)) return cache;

    const region = await getAwsRegion();
    const client = await getSSMClient();

    const command = new GetParametersCommand({
        Names: ["/madeira/jwt/secret-key"],
        WithDecryption: true
    });

    const response = await client.send(command);
    let secret = response.Parameters?.[0]?.Value;

    // Only create placeholder if missing or explicitly set to CHANGE_ME.
    // Do NOT overwrite existing secrets (even short ones) because they may be used for password hashing.
    if (!secret || secret === "CHANGE_ME") {
        secret = "super-secret-jwt-key-madeira-2026-v2-!@#$%^&*()_change_in_production_";
        await createPlaceholderIfMissing(client, "/madeira/jwt/secret-key", secret);
        logger.warn("🔑 Created strong default JWT secret in SSM. Please replace with a secure key in production!");
    }

    const config = {
        JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || secret
    };

    cache = config;
    cacheTime = now;
    return config;
}

module.exports = { getJwtConfig };