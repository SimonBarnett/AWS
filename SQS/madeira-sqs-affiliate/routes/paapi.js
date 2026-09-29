// madeira-affiliate/routes/paapi.js
// PAAPI Handler - Amazon Creators API v3.2
// Hybrid searchItems + GetItems to force price on every product
// Updated: 5 July 2026

const axios = require('axios');
const { sql, logger, getAmazonConfig } = require('/opt/nodejs/helpers');
const { getDbPool, closeDbPool } = require('/opt/nodejs/conf/db-config');

const MAX_PAGES = parseInt(process.env.PAAPI_MAX_PAGES || '5', 10);
const BATCH_SIZE = parseInt(process.env.AFFILIATE_BATCH_SIZE, 10) || 100;
const CREATORS_API_BASE = 'https://creatorsapi.amazon/catalog/v1';

let tokenCache = {
    accessToken: null,
    expiresAt: 0
};

async function getAccessToken() {
    const now = Date.now();

    if (tokenCache.accessToken && now < tokenCache.expiresAt) {
        return tokenCache.accessToken;
    }

    const config = await getAmazonConfig();

    if (!config.AMAZON_ACCESS_KEY || !config.AMAZON_SECRET_KEY) {
        throw new Error('Missing Creators API v3.2 credentials');
    }

    const clientId = config.AMAZON_ACCESS_KEY;
    const clientSecret = config.AMAZON_SECRET_KEY;

    try {
        const tokenResponse = await axios.post(
            'https://api.amazon.co.uk/auth/o2/token',
            {
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'creatorsapi::default'
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );

        const { access_token, expires_in } = tokenResponse.data;

        tokenCache.accessToken = access_token;
        tokenCache.expiresAt = now + (expires_in * 1000) - 60000;

        logger.info('✅ Creators API v3.2 access token obtained successfully');
        return access_token;

    } catch (error) {
        logger.error('❌ Creators API v3.2 token error', {
            status: error.response?.status,
            data: error.response?.data
        });
        throw new Error('Creators API v3.2 authentication failed');
    }
}

async function run(event, externalPool = null) {
    const { catalogId, userid, category, subcategory, searchterms = [], lastId = 0 } = event || {};

    if (!catalogId || !userid) {
        throw new Error('Missing catalogId or userid');
    }

    let pool = externalPool;
    let weCreatedPool = false;

    try {
        if (!pool) {
            pool = await getDbPool();
            weCreatedPool = true;
        }

        return await performCreatorsApiSearch(pool, catalogId, userid, category, subcategory, searchterms, lastId);

    } catch (err) {
        logger.error('❌ PAAPI (Creators API v3.2) failed', { catalogId, error: err.message });
        throw err;
    } finally {
        if (weCreatedPool && pool) await closeDbPool().catch(() => {});
    }
}

async function performCreatorsApiSearch(pool, catalogId, userid, category, subcategory, searchterms = [], lastId = 0) {
    const accessToken = await getAccessToken();
    const config = await getAmazonConfig();
    const associateTag = config.AMAZON_ASSOCIATE_TAG;

    let rawTerms = Array.isArray(searchterms) && searchterms.length > 0 
        ? searchterms 
        : (typeof searchterms === 'string' ? searchterms.split(',').map(t => t.trim()).filter(Boolean) : []);

    if (rawTerms.length === 0) {
        rawTerms = [`${category} ${subcategory}`];
    }

    const cleanTerms = rawTerms.map(t => t.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);

    logger.info('🔎 Creators API v3.2 search started', { catalogId, termsCount: cleanTerms.length });

    const rejectedResult = await getRejectedPairs(pool, userid, category, subcategory);
    const rejectedAsins = new Set(rejectedResult.map(r => r.ASIN));

    let goodItems = [];

    for (const keyword of cleanTerms) {
        if (goodItems.length > 0) break;

        for (let page = 1; page <= MAX_PAGES; page++) {
            try {
                const requestBody = {
                    keywords: keyword,
                    partnerTag: associateTag,
                    marketplace: 'www.amazon.co.uk',
                    itemPage: page,
                    resources: [
                        'itemInfo.title',
                        'images.primary.medium',
                        'offersV2.listings.price',
                        'itemInfo.byLineInfo'
                    ]
                };

                const response = await axios.post(
                    `${CREATORS_API_BASE}/searchItems`,
                    requestBody,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'x-marketplace': 'www.amazon.co.uk'
                        },
                        timeout: 15000
                    }
                );

                const items = response.data?.searchResult?.items || [];

                for (const item of items) {
                    if (item.asin && !rejectedAsins.has(item.asin)) {
                        rejectedAsins.add(item.asin);
                        goodItems.push(item);
                    }
                }

                if (items.length < 10) break;

                await new Promise(resolve => setTimeout(resolve, 1100));

            } catch (err) {
                const status = err.response?.status;

                if (status === 429) {
                    logger.warn('Rate limit hit (429). Backing off...', { page });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                logger.warn('Creators API v3.2 error', {
                    page,
                    status,
                    error: err.response?.data || err.message
                });

                if (status === 401) {
                    tokenCache.accessToken = null;
                    throw new Error('Creators API v3.2 Unauthorized');
                }

                break;
            }
        }
    }

    // ====================== FORCE PRICE USING GetItems FOR ITEMS WITHOUT PRICE ======================
    const itemsWithoutPrice = goodItems.filter(item => {
        const listings = item.offersV2?.listings;
        const hasPrice = Array.isArray(listings) && listings.length > 0 && 
                        (listings[0].price?.money?.displayAmount || listings[0].price?.displayAmount);
        return !hasPrice;
    });

    if (itemsWithoutPrice.length > 0) {
        logger.info('🔄 Forcing price via GetItems for items without offer data', { 
            count: itemsWithoutPrice.length 
        });

        const asinBatches = [];
        for (let i = 0; i < itemsWithoutPrice.length; i += 10) {
            asinBatches.push(itemsWithoutPrice.slice(i, i + 10).map(item => item.asin));
        }

        for (const asinBatch of asinBatches) {
            try {
                const getItemsBody = {
                    asinList: asinBatch,
                    partnerTag: associateTag,
                    marketplace: 'www.amazon.co.uk',
                    resources: [
                        'itemInfo.title',
                        'images.primary.medium',
                        'offersV2.listings.price',
                        'itemInfo.byLineInfo'
                    ]
                };

                const getItemsResponse = await axios.post(
                    `${CREATORS_API_BASE}/getItems`,
                    getItemsBody,
                    {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'x-marketplace': 'www.amazon.co.uk'
                        },
                        timeout: 15000
                    }
                );

                const getItemsResult = getItemsResponse.data?.getItemsResult || {};

                if (getItemsResult.items) {
                    for (const getItem of getItemsResult.items) {
                        const originalItem = goodItems.find(i => i.asin === getItem.asin);
                        if (originalItem && getItem.offersV2?.listings?.[0]?.price) {
                            const listing = getItem.offersV2.listings[0];
                            if (listing.price?.money?.displayAmount) {
                                originalItem.forcedPrice = listing.price.money.displayAmount;
                            } else if (listing.price?.displayAmount) {
                                originalItem.forcedPrice = listing.price.displayAmount;
                            }
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1100));

            } catch (err) {
                logger.warn('GetItems price fetch failed for batch', { 
                    asins: asinBatch.length, 
                    error: err.response?.data || err.message 
                });
            }
        }
    }

    const startIndex = lastId || 0;
    const batch = goodItems.slice(startIndex, startIndex + BATCH_SIZE);

    return {
        products: batch.map(item => {
            let price = 'N/A';
            let wasPrice = null;

            const listings = item.offersV2?.listings;

            // First try searchItems price
            if (Array.isArray(listings) && listings.length > 0) {
                const listing = listings[0];
                if (listing.price?.money?.displayAmount) {
                    price = listing.price.money.displayAmount;
                } else if (listing.price?.displayAmount) {
                    price = listing.price.displayAmount;
                } else if (listing.price?.money?.amount) {
                    price = `£${listing.price.money.amount}`;
                } else if (listing.price?.amount) {
                    price = `£${listing.price.amount}`;
                }
            }

            // Override with forced price from GetItems if we got one
            if (item.forcedPrice) {
                price = item.forcedPrice;
            }

            // was_price
            if (Array.isArray(listings) && listings.length > 0) {
                const listing = listings[0];
                if (listing.savingBasis?.money?.displayAmount) {
                    wasPrice = listing.savingBasis.money.displayAmount;
                } else if (listing.savingBasis?.displayAmount) {
                    wasPrice = listing.savingBasis.displayAmount;
                }
            }

            return {
                asin: item.asin,
                source: 'paapi',
                title: item.itemInfo?.title?.displayValue || '',
                price: price,
                discount: 'N/A',
                was_price: wasPrice,
                affiliate_url: `https://www.amazon.co.uk/dp/${item.asin}?tag=${associateTag}`,
                thumbnail_url: item.images?.primary?.medium?.url || '',
                brand: item.itemInfo?.byLineInfo?.brand?.displayValue || '',
                features: '',
                mpn: null,
                specifications: '',
                product_description: ''
            };
        }),
        lastId: startIndex + batch.length,
        totalFound: goodItems.length
    };
}

async function getRejectedPairs(pool, userid, category, subcategory) {
    try {
        const result = await pool.request()
            .input('userId', sql.NVarChar(100), userid)
            .input('affiliateKey', sql.NVarChar(50), 'paapi')
            .input('mainCategory', sql.NVarChar(510), category)
            .input('subCategory', sql.NVarChar(510), subcategory)
            .query(`
                SELECT ASIN FROM RejectedAsins 
                WHERE UserId = @userId 
                  AND AffiliateKey = @affiliateKey 
                  AND MainCategory = @mainCategory 
                  AND SubCategory = @subCategory
            `);
        return result.recordset || [];
    } catch {
        return [];
    }
}

module.exports = { run };