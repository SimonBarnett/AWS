# Madeira Lambda Layers

This directory contains the shared Lambda Layers used across the Madeira platform.

Each layer is designed to be **thin, focused, and reusable**. Business logic lives in the calling services (API, SQS catalogue, etc.).

---

## Available Layers

| Layer                        | Purpose                                                                 | Key Modules                                      | When to Use |
|-----------------------------|-------------------------------------------------------------------------|--------------------------------------------------|-------------|
| **madeira-core-layer**      | Foundational utilities, DB pooling, logging, config, S3, SQS, retry logic | `helpers.js`, `executeWithRetry`, config loaders | **Always required** by other layers and services |
| **madeira-auth-layer**      | Authentication & authorization (JWT, user helpers, permissions)        | `jwt.js`, `auth-utils.js`                        | Any service that needs JWT signing/verification or user context |
| **madeira-grok-layer**      | xAI Grok structured output + batch processing                          | `grok.js`, `grok-batch.js`                       | Services that need LLM structured JSON output or batch inference |
| **madeira-payments-layer**  | Email, SMS, and Stripe payment integration                             | `mailer.js`, `sms.js`, `stripe.js`               | Services that send transactional emails/SMS or process Stripe payments |

---

## Layer Descriptions

### 1. `madeira-core-layer`
**The foundation layer.**  
Contains the shared `helpers.js` orchestrator plus all configuration loaders.

**Key responsibilities:**
- Database connection pooling + `executeWithRetry`
- Logger (winston)
- S3, SQS, SSM clients
- All config modules (`jwt-config.js`, `stripe-config.js`, `sms-config.js`, `mailer-config.js`, `grok-config.js`, etc.)
- Common utilities (phone normalization, password hashing, etc.)

**Every other layer and most services depend on this layer.**

→ [Full Documentation →](madeira-core-layer/readme.md)

---

### 2. `madeira-auth-layer`
Handles JWT lifecycle and user-related authentication helpers.

**Key responsibilities:**
- `signJWT()` / `verifyJWT()`
- User ID generation and validation
- Permission checking helpers

→ [Full Documentation →](madeira-auth-layer/readme.md)

---

### 3. `madeira-grok-layer`
Dedicated layer for xAI Grok structured output and batch processing.

**Key responsibilities:**
- `callGrokStructured()` — streaming + JSON Schema enforcement + Ajv validation
- Full xAI Batch API lifecycle (`grok-batch.js`)
- Structured output with automatic schema validation

→ [Full Documentation →](madeira-grok-layer/readme.md)

---

### 4. `madeira-payments-layer`
Handles all outbound communication and payment processing.

**Key responsibilities:**
- `sendMail()` — branded transactional emails with automatic footer + S3 images
- `sendSmsTextmagic()` — SMS via TextMagic with UK phone normalization
- `getStripeClient()` — smart live/sandbox Stripe client with partner `index.json` detection

→ [Full Documentation →](madeira-payments-layer/readme.md)

---

## Usage Pattern

Most services import from layers like this:

```js
const { logger, executeWithRetry, sql, getDbConnection } = require('/opt/nodejs/helpers');
const { signJWT, verifyJWT } = require('/opt/nodejs/jwt');
const { sendMail } = require('/opt/nodejs/mailer');
const { getStripeClient } = require('/opt/nodejs/stripe');
const { callGrokStructured } = require('/opt/nodejs/grok');
```

---

## Adding a New Layer

1. Create a new folder under `Layers/` (e.g. `madeira-foo-layer`)
2. Place Node.js code under `nodejs/`
3. Add a clear `readme.md` following the existing style
4. Update this index file with a short description and link

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)