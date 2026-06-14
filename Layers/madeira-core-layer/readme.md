# Madeira Core Layer (`madeira-core-layer`)

This is the **shared Lambda Layer** used by all Madeira platform services (API Gateway, SQS Catalogue, Top-up Lambda, etc.).

It provides centralized:
- AWS client factories (S3, SQS, SSM, Lambda)
- Database connection pooling + retry logic
- Configuration management (via SSM Parameter Store + environment variable fallbacks)
- Common utilities (bcrypt, logging, message enqueueing)

**Location in repo:** `Layers/madeira-core-layer/`

---

## Folder Structure

```
Layers/madeira-core-layer/
├── nodejs/
│   ├── helpers.js              ← Main orchestrator (re-exports everything)
│   ├── conf/
│   │   ├── db-config.js
│   │   ├── jwt-config.js
│   │   ├── sms-config.js
│   │   ├── incentive-config.js
│   │   ├── stripe-config.js
│   │   ├── mailer-config.js
│   │   ├── grok-config.js
│   │   ├── ebay-config.js
│   │   ├── amazon-config.js
│   │   └── awin-config.js
│   └── (other modules: jwt.js, mailer.js, sms.js, etc.)
```

---

## Main Entry Point: `helpers.js`

This file is the **single import point** for the entire layer.

```js
const {
    logger,
    getDbConnection,
    executeWithRetry,
    enqueueMessage,
    getJwtConfig,
    getSmsConfig,
    // ... many more
} = require('/opt/nodejs/helpers');
```

### Key Exports

| Export                    | Description                                      | Source                  |
|---------------------------|--------------------------------------------------|-------------------------|
| `logger`                  | Winston logger (JSON format)                     | `helpers.js`            |
| `getDbConnection`         | Returns MSSQL connection pool                    | `conf/db-config.js`     |
| `executeWithRetry`        | Retry wrapper for queries / MERGE operations     | `conf/db-config.js`     |
| `enqueueMessage`          | Send message to SQS (supports FIFO)              | `helpers.js`            |
| `hashPassword` / `comparePassword` | bcrypt helpers                            | `helpers.js`            |
| `getS3Client`, `getSQSClient`, `getSSMClient`, `getLambdaClient` | Cached AWS SDK v3 clients | `helpers.js` |
| `getAwsRegion`            | Resolves region (SSM override supported)         | `helpers.js`            |

---

## Configuration Modules & SSM Parameters

All configuration is loaded from **AWS Systems Manager Parameter Store** with environment variable fallbacks and self-healing placeholders.

### 1. Database (`db-config.js`)

| SSM Parameter                  | Description                     | Default / Notes                  |
|--------------------------------|---------------------------------|----------------------------------|
| `/madeira/db/user`             | Database username               | `madeira_app`                    |
| `/madeira/db/password`         | Database password               | (Secret)                         |
| `/madeira/db/server`           | RDS endpoint                    | —                                |
| `/madeira/db/name`             | Database name                   | `madeiradb`                      |

**Environment variable overrides:** `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_NAME`

---

### 2. JWT (`jwt-config.js`)

| SSM Parameter                  | Description                     | Notes                                      |
|--------------------------------|---------------------------------|--------------------------------------------|
| `/madeira/jwt/secret-key`      | JWT signing secret              | **Critical** – used for auth + password hashing in some flows |

**Environment variable override:** `JWT_SECRET_KEY`

> **Warning:** Do **not** overwrite this parameter if it already has a real value.

---

### 3. SMS / TextMagic (`sms-config.js`)

| SSM Parameter                          | Description                  | Default                     |
|----------------------------------------|------------------------------|-----------------------------|
| `/madeira/sms/textmagic-username`      | TextMagic username           | `CHANGE_ME`                 |
| `/madeira/sms/textmagic-api-key`       | TextMagic API key            | `CHANGE_ME`                 |
| `/madeira/sms/textmagic-from`          | SMS sender name              | `ClubMadeira`               |
| `/madeira/sms/textmagic-url`           | TextMagic API endpoint       | `https://rest.textmagic.com/api/v2` |

**Environment variable overrides:** `TEXTMAGIC_USERNAME`, `TEXTMAGIC_API_KEY`, `TEXTMAGIC_FROM`, `TEXTMAGIC_URL`

---

### 4. Amazon Incentive / Top-up (`incentive-config.js`)

Used by the `amazoncard-topup` Lambda.

| SSM Parameter                          | Description                     | Default          |
|----------------------------------------|---------------------------------|------------------|
| `/madeira/incentive/access-key-id`     | Amazon PA-API Access Key        | `CHANGE_ME`      |
| `/madeira/incentive/secret-access-key` | Amazon PA-API Secret Key        | `CHANGE_ME`      |
| `/madeira/incentive/brand`             | Brand name for reports          | `Club Madeira`   |
| `/madeira/incentive/currency`          | Currency                        | `GBP`            |
| `/madeira/incentive/partner-id`        | Amazon Partner / Associate ID   | `CHANGE_ME`      |
| `/madeira/incentive/sandbox`           | Run in sandbox mode             | `true`           |

**Environment variable overrides:** `AMAZON_ACCESS_KEY_ID`, `AMAZON_SECRET_ACCESS_KEY`, `AMAZON_BRAND`, `AMAZON_CURRENCY`, `AMAZON_PARTNER_ID`, `AMAZON_SANDBOX`

---

### 5. Other Configs (Summary)

| Module                | SSM Path Prefix              | Purpose                              | Key Parameters |
|-----------------------|------------------------------|--------------------------------------|----------------|
| `stripe-config.js`    | `/madeira/stripe/`           | Stripe Connect / payments            | secret key, webhook secret |
| `mailer-config.js`    | `/madeira/mailer/`           | Email sending (SendGrid / SES)       | API key, from address |
| `awin-config.js`      | `/madeira/awin/`             | Awin affiliate integration           | API key, publisher ID |
| `ebay-config.js`      | `/madeira/ebay/`             | eBay API credentials                 | App ID, Cert ID |
| `amazon-config.js`    | `/madeira/amazon/`           | General Amazon settings              | — |
| `grok-config.js`      | `/madeira/grok/`             | Internal Grok / AI settings          | — |

---

## Usage Examples

### Database + Retry

```js
const { getDbConnection, executeWithRetry, sql } = require('/opt/nodejs/helpers');

const pool = await getDbConnection();

const result = await executeWithRetry(() =>
    pool.request()
        .input('userId', sql.VarChar, userId)
        .query('SELECT * FROM Users WHERE user_id = @userId')
);
```

### Enqueue SQS Message

```js
const { enqueueMessage } = require('/opt/nodejs/helpers');

await enqueueMessage({
    type: 'CLUBSCAN_GENERATE_REVIEW',
    url: 'https://example.com'
});
```

### Get JWT Config

```js
const { getJwtConfig } = require('/opt/nodejs/helpers');
const { JWT_SECRET_KEY } = await getJwtConfig();
```

---

## Important Notes

- All config modules use **30-minute caching** to reduce SSM calls.
- Missing parameters are automatically created as `CHANGE_ME` placeholders (self-healing).
- The layer is designed to be **idempotent** and safe to update.
- `executeWithRetry` is the recommended way to run all database operations (handles deadlocks and transient errors).
- Never import config modules directly — always go through `helpers.js`.

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)