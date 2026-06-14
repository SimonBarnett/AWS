# Madeira Affiliate Search Connectors

This folder contains the **search connectors** used by the `madeira-sqs-affiliate` Lambda.

These connectors power the **searchable affiliate datasources** that appear in the Madeira catalogue widget and search interfaces.

## Purpose

Unlike the merchant connectors (which import a merchant’s full catalogue), these connectors perform **on-demand or batched searches** across different product sources to enrich the Madeira catalogue with relevant affiliate products.

## Supported Sources

| File        | Source              | Type                    | Description                                                                 |
|-------------|---------------------|-------------------------|-----------------------------------------------------------------------------|
| `awin.js`   | Internal MerchantProducts | Database Search     | Searches products previously imported via the merchant pipeline             |
| `eBay.js`   | eBay                | Live API Search         | Real-time search against eBay Buy Browse API                                |
| `paapi.js`  | Amazon (PA-API)     | Live API Search         | Real-time search against Amazon Product Advertising API                     |

## Key Difference from Merchant Connectors

- **Merchant connectors** (`madeira-sqs-merchant`) → Full catalogue import
- **Affiliate connectors** (`madeira-sqs-affiliate`) → Search / discovery layer

The `awin` source is special: it searches the `MerchantProducts` table, which contains **all products** that have been successfully imported through the merchant SQS pipeline. This gives partners access to a large, already-vetted product pool.

## Common Interface

All connectors export a `run(event)` function and return:

```js
{
  products: [...],
  lastId: number,
  totalFound?: number
}
```

They support **keyset pagination** via `lastId` so large result sets can be processed in chunks.

## Connector Details

### `awin.js` (Internal MerchantProducts Search)

- **Source**: `MerchantProducts` table (populated by `madeira-sqs-merchant`)
- **Search method**: SQL `CONTAINS` full-text search
- **Special features**:
  - Excludes products in `RejectedAsins` for the current user/category
  - Uses keyset pagination (`ID > lastId`)
  - Chunked fetching with retry and exponential backoff
  - Pre-check to avoid unnecessary work when no matches exist
- **Use case**: When a partner wants to search across **all previously onboarded merchant products**.

**Environment variables**:
- `AFFILIATE_BATCH_SIZE` (default 100)
- `AWIN_CHUNK_SIZE`
- `AWIN_MAX_CHUNKS_PER_INVOCATION`

### `eBay.js`

- **Source**: eBay Buy Browse API v1
- **Authentication**: OAuth2 Client Credentials
- **Features**:
  - Tries multiple search terms until results are found
  - Respects rate limits + global 429 backoff
  - Excludes rejected ASINs
  - Supports batching via `lastId`
- **Use case**: Supplementing catalogue with current eBay listings.

**Important**: Aborts immediately on 401 Unauthorized.

### `paapi.js` (Amazon PA-API)

- **Source**: Amazon Product Advertising API v5
- **Authentication**: AWS Signature v4 (via `paapi5-nodejs-sdk`)
- **Features**:
  - Tries multiple keywords until results found
  - Rate limited (~1 request per second)
  - Excludes rejected ASINs
  - Returns clean normalized product shape with affiliate deep links
- **Use case**: High-quality Amazon product recommendations.

**Important**: Aborts on authentication/permission errors.

## RejectedAsins Handling

All three connectors respect the `RejectedAsins` table. Products that a user has previously rejected for a specific category/subcategory are filtered out during search.

This is queried per connector using the combination of:
- `UserId`
- `AffiliateKey` (`awin`, `ebay`, or `paapi`)
- `MainCategory` + `SubCategory`

## How These Are Called

These routes are typically invoked from the main affiliate processing logic (usually `affiliate.js` in the parent folder) with a payload like:

```json
{
  "catalogId": "...",
  "userid": "ABC12345",
  "category": "Electronics",
  "subcategory": "Headphones",
  "searchterms": ["noise cancelling", "wireless"],
  "lastId": 0
}
```

## Adding a New Affiliate Source

1. Create `routes/newSource.js`
2. Export `{ run }`
3. Implement `run(event)` that returns `{ products, lastId }`
4. Respect `RejectedAsins` filtering
5. Add proper rate limiting and error handling
6. Update this README

## Notes

- These connectors are **read-only search** layers. They do not import full catalogues.
- The `awin` source is the bridge between the merchant import system and the affiliate search system.
- All connectors are designed to be called repeatedly with increasing `lastId` for large result sets.

---

**Last updated:** 14 June 2026