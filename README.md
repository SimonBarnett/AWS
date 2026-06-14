# Club Madeira — Affiliate Commerce Platform

![Club Madeira](https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/icon-512.png)

**The complete serverless ecosystem powering Club, Community & Merchant affiliate commerce.**

Built on **AWS Lambda + API Gateway + SQS + Aurora** with heavy use of **shared Lambda Layers** for maximum reusability and multi-region deployment capability.

---

## 🚀 Big Picture

Club Madeira is an intelligent affiliate platform that connects:

- **Clubs & Communities** (who earn commissions)
- **Merchants** (who list products)
- **Partners** (web designers/agencies who onboard clubs)

The system allows any website to embed powerful affiliate widgets that dynamically display relevant products, while running sophisticated background processing (catalogue ingestion, AI relevance scoring via Grok, multi-network search, etc.).

### Core Value Proposition

A fully modular, **region-agnostic**, production-grade serverless platform that can be deployed in any AWS region with minimal changes thanks to **centralised Layers** + **SSM Parameter Store** configuration.

---

## 🏗️ High-Level Architecture & Key Capabilities

### Merchant Parts & Product Discovery (Foundation)

Madeira discovers and imports real merchant products from multiple affiliate networks.

**Current status:**
- **Awin integration** is fully active with **hundreds of advertisers**.
- Connectors for **Wix**, **WooCommerce**, and **Shopify** have been built and tested.
- However, we currently have **no live merchants using those platforms**.
- Amazon Associates and eBay Partner Network are also active.

The **Awin pipeline** (Lambdas + SQS) currently serves as the main aggregator. This rich merchant parts data powers catalogue generation, **Grok-powered AI selection of best parts per category/website**, and the widgets shown to end users.

**Key component:** [Lambdas/madeira-awin-clubscan](Lambdas/madeira-awin-clubscan)

### Self-Healing & Diagnostics

**[Lambdas/madeira-layer-cake](Lambdas/madeira-layer-cake)** — The dedicated **Layer Validation & Self-Healing Test Lambda**.

It actively exercises every shared layer and acts as a canary for detecting broken dependencies.

**[Browse all Lambdas →](Lambdas/README.md)**

---

## 📁 Repository Structure & Documentation

| Section | Purpose | Key Documentation |
|--------|--------|-------------------|
| **[API](./API)** | Main HTTP API + routing | [API/README.md](./API/README.md) |
| **[Layers](./Layers)** | Reusable business logic & AWS clients | [Core](./Layers/madeira-core-layer/readme.md) • [Auth](./Layers/madeira-auth-layer/readme.md) • [Payments](./Layers/madeira-payments-layer/readme.md) • [Grok](./Layers/madeira-grok-layer/readme.md) |
| **[SQS](./SQS)** | Asynchronous background jobs | [SQS Overview](./SQS/readme.md) |
| **[RDS](./RDS)** | Database schema & low-priv access | [RDS/README.md](./RDS/readme.md) |
| **[S3-Bucket](./S3-Bucket)** | All JavaScript widgets | Widgets for clubs, partners, merchants |
| **[HOST/partner](./HOST/partner)** | Complete package given to web agencies | [Partner Guide](./HOST/partner/readme.md) |
| **[Lambdas](./Lambdas)** | Standalone functions | [Lambdas Overview](./Lambdas/README.md) |
| **[Extension](./Extension)** | Browser extension for voucher claiming | Chrome + Safari |

---

## ✨ Key Innovations & Design Highlights

- **Multi-Region Ready**: All configuration lives in SSM Parameter Store + shared Layers.
- **Layer-First Architecture**: Dramatically reduces duplication.
- **Event-Driven Backbone**: Three specialised SQS queues handle heavy lifting.
- **Smart Sandboxing**: Every pipeline supports `sandbox: true`.
- **Self-Healing**: Automatic recovery, retry logic, and `madeira-layer-cake` validation.
- **Embedded Widgets**: Zero-dependency JavaScript that works on any static site.

---

## 🧩 Major Components

**See individual folder READMEs for deep dives.**

---

## 🚀 Getting Started & Deployment

See individual folder readmes for detailed instructions.

**General flow:**
1. Deploy Lambda Layers first
2. Deploy API + SQS functions
3. Configure SSM parameters
4. Upload widgets to S3
5. Give partners the `/HOST/partner` package

---

**Project Owner**: Simon Barnett  
**Status**: Production + Sandbox environments active  
**Philosophy**: Maximum reusability, strong separation of concerns, and developer experience first.

---

Made with ❤️ for clubs, communities and independent merchants.

**Club Madeira — Turning passion into profit.**

_Last updated: 14 June 2026_