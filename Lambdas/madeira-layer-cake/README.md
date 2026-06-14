# Madeira Layer Cake (`lambdas/madeira-layer-cake`)

**Purpose:**  
This Lambda serves as the **official verification and diagnostic tool** for the shared Madeira layers.

It is designed to quickly test that all core layers are correctly deployed, mounted, and functioning inside a Lambda environment.

> Think of it as the "canary" or health-check Lambda for the entire layer ecosystem.

---

## Why This Lambda Exists

When developing or updating shared layers, it is easy to accidentally break something for consuming Lambdas. This Lambda provides a fast, isolated way to verify that the following layers are working correctly:

- Core helpers (`/opt/nodejs/helpers`)
- JWT / Auth utilities (`/opt/nodejs/jwt`)
- Grok / xAI client (`/opt/nodejs/grok`)
- Stripe integration (`/opt/nodejs/stripe`)
- Mailer (`/opt/nodejs/mailer`)

It has **zero npm dependencies** — everything it needs comes from the layers.

---

## How to Use

Trigger this Lambda with a JSON test event containing a `test` (or `route`) field.

### Example Test Events

```json
{ "test": "health" }
```

```json
{ "test": "auth-jwt" }
```

```json
{ "test": "grok" }
```

You can run these directly from the AWS Lambda Console → **Test** tab.

---

## Available Test Cases

| Test Case            | Layer(s) Tested          | What It Does                                                                 |
|----------------------|--------------------------|-------------------------------------------------------------------------------|
| `health`             | All                      | Basic smoke test — confirms layers loaded successfully                        |
| `core-region`        | Core                     | Returns the AWS region the Lambda is running in                               |
| `core-sqs`           | Core                     | Sends a test message to the configured SQS queue                              |
| `auth-userid`        | Auth                     | Generates and validates a user ID                                             |
| `auth-jwt`           | Auth                     | Signs and verifies a JWT token                                                |
| `auth-password`      | Auth                     | Hashes a password and verifies it                                             |
| `grok`               | Grok                     | Calls Grok with a simple structured output request                            |
| `payments-stripe`    | Stripe                   | Initialises Stripe client and reports sandbox/platform status                 |
| `payments-mailer`    | Mailer                   | Loads mailer config (host, bucket, etc.)                                      |

If an unknown test case is provided, the Lambda returns the list of available tests.

---

## Layer Imports Used

```js
const { logger, getAwsRegion, hashPassword, comparePassword, enqueueMessage } = require('/opt/nodejs/helpers');

const { generateUserId, validateUserId, signJWT, verifyJWT } = require('/opt/nodejs/jwt');

const { callGrokStructured } = require('/opt/nodejs/grok');

const { getStripeClient } = require('/opt/nodejs/stripe');

const { sendMail } = require('/opt/nodejs/mailer');
```

This Lambda is intentionally kept minimal so it can serve as a reliable reference for how other Lambdas should import from the layers.

---

## Deployment & Packaging

This Lambda should be deployed with **no bundled dependencies**. 
The deployment package only needs to contain `index.js`.

A pre-built zip (`madeira-layer-cake.zip`) is included in the folder for convenience.

---

## Operational Use Cases

- **After layer updates** — Run the full test suite to verify nothing is broken.
- **New environment / region** — Quick smoke test that layers are correctly deployed.
- **Debugging layer issues** — Isolate whether a problem exists in a specific layer or in application code.
- **CI / CD validation** — Can be called automatically after layer deployments.

---

## File Structure

```
Lambdas/madeira-layer-cake/
├── index.js
├── package.json
├── package-lock.json
├── madeira-layer-cake.zip
└── README.md
```

---

## Notes

- This Lambda is **not** part of normal business flows. It exists purely for verification.
- One minor inconsistency exists in the `payments-mailer` test (uses inline `require`). This is harmless but could be standardised in future.
- Keep this Lambda lightweight. Do not add business logic here.

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Purpose:** Layer verification & diagnostics