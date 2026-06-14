# Lambdas Overview

This directory contains the standalone AWS Lambda functions used by the Madeira platform.

These Lambdas are intentionally kept separate from the main API Gateway because they either:

- Perform scheduled/background jobs
- Have special dependencies (e.g. aws-sdk v2 signing)
- Serve as diagnostic tools
- Handle specific third-party integrations

All modernised Lambdas follow the shared layer architecture (`/opt/nodejs/...`).

---

## Lambdas

| Lambda | Purpose | Trigger | Layer Compliant | Notes |
|--------|---------|---------|------------------|-------|
| [**madeira-awin-clubscan**](madeira-awin-clubscan/) | Awin advertiser recommendations + onboarding support for clubs | EventBridge Scheduler | Yes | **Core merchant acquisition engine** |
| [**madeira-posthog-updatedb**](madeira-posthog-updatedb/) | Ingests PostHog events into local DB for audit trail & future analysis | EventBridge Scheduler | Yes | Originally intended for bad actor / fraud detection |
| [**madeira-layer-cake**](madeira-layer-cake/) | Diagnostic Lambda to verify all shared layers are working correctly | Manual / Test events | Yes | The "canary" for the layer system |
| [**amazoncard-topup**](amazoncard-topup/) | Weekly top-up of Amazon gift cards (AGCOD) | EventBridge Scheduler | Partial | Intentionally keeps aws-sdk v2 for signing reliability |

---

## Summary of Functionality

### 1. [madeira-awin-clubscan](madeira-awin-clubscan/)

**This is one of the most important Lambdas in the system.**

It powers the **Awin merchant acquisition flow** — a key channel for bringing new merchants (and their product catalogues) into Madeira.

#### Core Flows

- **Global mode**: Daily recommendations of high-approval Awin advertisers.
- **Club mode** (most important): When a new community/club onboards, the system generates a personalised list of relevant Awin advertisers that the **partner can apply to on behalf of the club**. 
  - If the partner successfully onboards the Awin supplier, they earn an **extra percentage** on all future transactions from that advertiser.

#### Why Merchant Parts Matter

The recommendation engine (both global and club-specific) only delivers real value if there is a healthy, high-quality pool of **Awin merchants and their product parts** available to recommend and list in the Madeira catalogue.

Without a good selection of merchants/parts from Awin:
- Recommendations become weak or irrelevant
- Partners have fewer opportunities to earn extra commission
- The overall network growth slows down

Maintaining strong coverage of Awin merchants (via `sync-merchants` and ongoing onboarding) is therefore critical to the health of the entire affiliate programme.

#### Supporting Jobs

- `sync-merchants`: Keeps the local high-approval merchant table up to date
- `awin-payments`: Ingests recent Awin transactions
- `onboarding`: Handles new advertiser onboarding + daily operational reports

**Full documentation**: See [madeira-awin-clubscan/README.md](madeira-awin-clubscan/README.md) and the detailed [routes/README.md](madeira-awin-clubscan/routes/README.md).

### 2. [madeira-posthog-updatedb](madeira-posthog-updatedb/)

Pulls events from PostHog and stores them locally in the `PostHogEvents` table with referrer enrichment.

Intended as an off-site audit log that could later support bad actor detection and platform integrity monitoring.

Currently focused on reliable ingestion. Deeper analysis features are future work.

### 3. [madeira-layer-cake](madeira-layer-cake/)

A lightweight diagnostic Lambda used to test that the shared layers (core, auth, grok, payments, etc.) are correctly deployed and functioning.

Useful after layer updates or when deploying to new regions.

### 4. [amazoncard-topup](amazoncard-topup/)

Runs weekly to top up Amazon gift card balance in the system using the AGCOD API.

This Lambda deliberately retains `aws-sdk` v2 because of complex SigV4 signing requirements for Amazon's gift card service.

---

## Development Notes

- Most Lambdas should have **zero npm dependencies** and rely on the shared layers.
- The exception is `amazoncard-topup`, which requires aws-sdk v2 for legacy signing.
- Each Lambda has its own `README.md` with detailed documentation.
- Scheduled Lambdas are triggered via **Amazon EventBridge Scheduler**.

---

## Related Documentation

- [Layers Overview](../Layers/README.md)
- Individual Lambda READMEs in their respective folders

**Last Updated:** 14 June 2026