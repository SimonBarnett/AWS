# Madeira Merchant Connectors

This folder contains **platform-specific connectors** used by the `madeira-sqs-merchant` Lambda.

Each connector is responsible for fetching product/parts data from a third-party e-commerce platform and returning it in a **standardized normalized format** that the rest of the Madeira system can consume.

## Purpose

These connectors allow merchants (clubs, communities, partners) to connect their existing online stores to Madeira so their products can be listed, promoted, and sold through the affiliate network.

## Supported Platforms

| File              | Platform          | API Type          | Pagination          | Notes                                      |
|-------------------|-------------------|-------------------|---------------------|--------------------------------------------|
| `awin.js`         | Awin              | CSV Feed (gzipped)| Streaming           | Affiliate network feed                     |
| `bigCommerce.js`  | BigCommerce       | REST API v3       | Offset + Limit      | Uses Catalog API                           |
| `magento.js`      | Magento           | REST API v1       | Page-based          | Supports store codes                       |
| `shopify.js`      | Shopify           | Admin REST API    | Link header         | Handles variants & pricing                 |
| `wixStore.js`     | Wix               | Stores API        | Offset + auto-version| Auto-detects v1/v2/v3                      |
| `wooCommerce.js`  | WooCommerce       | REST API v3       | Page-based          | WordPress-based stores                     |

## Normalized Output Format

All connectors return an array of products in this common shape:

```json
{
  "id": "string",
  "name": "string",
  "currency": "GBP",
  "originalPrice": 0,
  "discountedPrice": 0,
  "description": "string",
  "specifications": "string",
  "category": "string",
  "subcategory": "string",
  "sku": "string",
  "brand": "string",
  "mainImageUrl": "string",
  "affiliatePath": "string",
  "categoryId": "string"
}
```

## Connector Details

### 1. `awin.js`

- **Type**: Streaming CSV parser (low memory)
- **Input**: `apiKeyData.feedUrl` (gzipped CSV from Awin)
- **Special features**:
  - Robust quoted CSV parser
  - Handles multiple possible column names
  - Filters out rows missing `id` or `name`
- **Use case**: Importing large affiliate product feeds from Awin merchants.

### 2. `bigCommerce.js`

- **Type**: REST API v3 Catalog
- **Required in `apiKeyData`**:
  - `API_TOKEN`
  - `STORE_HASH`
  - `STORE_URL`
- **Features**:
  - Paginates through all products + variants
  - Calculates lowest price across variants
  - Includes primary category and images

### 3. `magento.js`

- **Type**: Magento REST API v1
- **Required in `apiKeyData`**:
  - `ACCESS_TOKEN`
  - `STORE_URL`
  - `STORE_CODE` (optional)
- **Features**:
  - Fetches currency from store config
  - Rate limiting between pages
  - Extracts `special_price`, `manufacturer`, `url_key`, and media gallery

### 4. `shopify.js`

- **Type**: Shopify Admin REST API
- **Required in `apiKeyData`**:
  - `ACCESS_TOKEN`
  - `STORE_URL` (must end with `.myshopify.com`)
- **Features**:
  - Uses `Link` header for pagination
  - Handles variant pricing (lowest price wins)
  - Extracts `product_type` as category and `vendor` as brand

### 5. `wixStore.js`

- **Type**: Wix Stores API (auto version detection)
- **Required in `apiKeyData`**:
  - `API_TOKEN` (Client ID)
  - `SITE_ID`
- **Special behavior**:
  - Automatically detects and switches between v1 / v2 / v3 if the site returns a 428 error
  - Parses rich text descriptions from nodes (v3)

### 6. `wooCommerce.js`

- **Type**: WooCommerce REST API v3
- **Required in `apiKeyData`**:
  - `baseUrl`
  - `consumerKey`
  - `consumerSecret`
- **Features**:
  - Fetches currency from WooCommerce settings
  - Only returns published products
  - Simple and lightweight implementation

## How Connectors Are Called

The main `madeira-sqs-merchant` handler loads the correct connector based on the `api_key_type` stored in the merchant’s `UserApiKeys` record. It then calls:

```js
const connector = require(`./routes/${apiKeyType}.js`);
const result = await connector.handler(event);
```

## Adding a New Connector

1. Create a new file `routes/yourPlatform.js`
2. Export a function with this signature:

   ```js
   exports.handler = async (event) => {
       // event.apiKeyData contains the merchant's stored credentials
       // return { products: [...] }
   };
   ```

3. Normalize all products to the common format shown above.
4. Add proper error handling and logging using the shared `logger`.
5. Update this README.

## Notes

- All connectors are designed to be **stateless** and run inside the SQS-triggered Lambda.
- Heavy lifting (category building, search term generation, notifications) happens in downstream SQS messages.
- Connectors should **not** write to the database directly — they only return normalized data.

---

**Last updated:** 14 June 2026