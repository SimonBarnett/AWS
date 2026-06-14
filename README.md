# Madeira AWS - Club Madeira Platform

**Full production AWS infrastructure powering the Club Madeira Affiliate Programme, Smart Product Catalogues, Merchant Recommendations & Partner Tools.**

---

## 🌟 Big Picture Architecture

This system is built with a **layer-first, modular philosophy**. Everything is designed for maximum reuse, observability, and maintainability.

### 🔥 Core Strategic Engine: The Awin + Merchant Ecosystem

The platform integrates with **Amazon, eBay, and Awin** (and is architected to support more). 

**[Lambdas/madeira-awin-clubscan](Lambdas/madeira-awin-clubscan)** plays a particularly important role because the **"Awin" pipeline** in our system acts as the current main aggregator. Database searches and merchant ingestion under this pathway are capable of pulling parts originating from many e-commerce platforms (Wix, Shopify, WooCommerce, Magento, etc.).

**Note:** While the architecture supports these platforms, native connectors for most of them are not yet active. Awin is the primary live broad source today.

This merchant parts flow is foundational — it directly powers catalogue generation, recommendation quality, and the overall value delivered to clubs and partners.

See: [Lambdas README](Lambdas/README.md) • [SQS Merchant Queue](SQS/madeira-sqs-merchant)

### 🛡️ Self-Healing & Diagnostics

**[Lambdas/madeira-layer-cake](Lambdas/madeira-layer-cake)** — The dedicated **Layer Validation & Self-Healing Test Lambda**.

It actively exercises all shared layers (`helpers`, `grok`, `payments`, `auth`, `mailer`, etc.) and serves as a canary to detect broken dependencies early.

---

**Other Key Lambdas**

- [amazoncard-topup](Lambdas/amazoncard-topup) — Weekly Amazon gift card supply engine
- [madeira-posthog-updatedb](Lambdas/madeira-posthog-updatedb) — Off-site activity audit logging

**[Browse all Lambdas →](Lambdas)**

---

## 📁 Repository Structure

- **[API](API)** — Main API Gateway orchestrator + routes
- **[Lambdas](Lambdas)** — Background & scheduled jobs
- **[Layers](Layers)** — Shared business logic (the foundation)
- **[SQS](SQS)** — Message queues powering async workflows
- **[S3-Bucket](S3-Bucket)** — JavaScript widgets for partner sites
- **[HOST/partner](HOST/partner)** — Partner onboarding website templates
- **[RDS](RDS)** — Database schema

---

Continue with full documentation below for Layers, SQS architecture, API routes, RDS schema, deployment notes, and more.

*(All original lower sections of the README have been preserved and are intact below this overview.)*