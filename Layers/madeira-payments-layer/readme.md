# Madeira Payments Layer (`madeira-payments-layer`)

This layer handles **email**, **SMS**, and **Stripe** payment/integration functionality for the Madeira platform.

**Location in repo:** `Layers/madeira-payments-layer/`

---

## Overview

| Module         | Purpose                                      | Key Features |
|----------------|----------------------------------------------|--------------|
| `mailer.js`    | Send transactional emails with branded footer | S3 image embedding, nodemailer, automatic footer injection |
| `sms.js`       | Send SMS via TextMagic                       | Phone normalization, error handling |
| `stripe.js`    | Stripe client factory (live + sandbox)       | Dynamic sandbox detection from partner `index.json`, metadata attachment |

All modules depend on the **Core Layer** for configuration.

---

## 1. `mailer.js` — Email Sending with Branded Footer

### Main Export: `sendMail(mailOptions)`

Sends an email using **nodemailer** and automatically appends a professional footer containing:
- Club Madeira address and contact details
- Embedded images: `supportyourclub.png`, `applestore.png`, `chromestore.png` (fetched from S3)

### How It Works

1. Validates required fields (`from`, `to`, `subject`).
2. Loads mailer config from Core Layer (`getMailerConfig`).
3. Fetches three branding images from S3 in parallel.
4. Appends a styled HTML footer to `mailOptions.html`.
5. Attaches the images as inline `cid:` attachments.
6. Sends via nodemailer.

### Usage Example

```js
const { sendMail } = require('/opt/nodejs/mailer');

await sendMail({
    from: 'support@clubmadeira.uk',
    to: 'user@example.com',
    subject: 'Welcome to Club Madeira',
    html: '<p>Thank you for joining!</p>'
});
```

### Important Notes

- Images are cached per request (fetched fresh each time via S3).
- If any image is missing from S3, the email send will fail with a clear error.
- The footer is **always appended** to HTML emails.

---

## 2. `sms.js` — TextMagic SMS Client

### Main Export: `sendSmsTextmagic(phone, message)`

### Features

- Automatic UK phone number normalization (`07xxx` → `+447xxx`)
- Uses TextMagic REST API v2
- Returns `true` on success, `false` on failure (never throws)
- Detailed logging of success/failure

### Usage Example

```js
const { sendSmsTextmagic } = require('/opt/nodejs/sms');

const success = await sendSmsTextmagic('07123456789', 'Your PIN is 123456');
if (success) {
    console.log('SMS sent');
}
```

### Configuration

Comes from Core Layer (`getSmsConfig`):
- `TEXTMAGIC_USERNAME`
- `TEXTMAGIC_API_KEY`
- `TEXTMAGIC_FROM` (default: `ClubMadeira`)
- `TEXTMAGIC_URL`

---

## 3. `stripe.js` — Stripe Client Factory

### Main Export: `getStripeClient(event = {}, options = {})`

Returns a fully configured Stripe client that automatically detects **live vs sandbox** mode.

### Sandbox Detection Priority (in order)

1. `options.sandbox` (explicit)
2. `event.sandbox === true`
3. Partner’s `index.json` at `event.headers.origin` (original behavior)
4. `process.env.SANDBOX`

### Attached Metadata on Client

After creation, the returned client has these useful properties:

```js
client.platformAccountId
client.platformCustomerId
client.platformPaymentMethod
client.vatTaxRateId
client.isSandbox
```

### Usage Example

```js
const { getStripeClient } = require('/opt/nodejs/stripe');

const stripe = await getStripeClient(event); // auto-detects from origin

const paymentIntent = await stripe.paymentIntents.create({
    amount: 1000,
    currency: 'gbp',
    // ...
});
```

### Important Notes

- Uses Stripe API version `2024-06-20`
- Falls back gracefully if `index.json` cannot be fetched
- Throws a clear error if no valid secret key is configured

---

## Configuration Sources

All configuration for this layer comes from the **Core Layer**:

- Mailer config → `conf/mailer-config.js`
- SMS config → `conf/sms-config.js`
- Stripe config → `conf/stripe-config.js`

See the [Core Layer README](../madeira-core-layer/readme.md) for the full list of SSM parameters.

---

## Summary

| Concern       | Module       | Depends On          | Key Strength                          |
|---------------|--------------|---------------------|---------------------------------------|
| Email         | `mailer.js`  | Core + S3           | Automatic branded footer + images     |
| SMS           | `sms.js`     | Core                | Simple, reliable, normalized numbers  |
| Payments      | `stripe.js`  | Core                | Smart live/sandbox detection          |

This layer is designed to be **thin and focused** — business logic should live in the calling services (API, SQS, etc.).

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Depends on:** `madeira-core-layer`