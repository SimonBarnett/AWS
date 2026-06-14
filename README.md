# Madeira AWS - Club Madeira Platform

**Full production AWS infrastructure** powering the Club Madeira Affiliate Programme, Smart Product Catalogues, Merchant Recommendations, Partner Tools, and Widget Distribution.

---

## 🌟 Big Picture Architecture

This system is built with a **layer-first, modular philosophy**. Everything is designed for maximum code reuse, consistency, and maintainability through shared Lambda Layers.

### 🔥 Merchant Discovery & Parts Ingestion

Madeira can ingest real merchant products and parts from multiple affiliate networks and e-commerce platforms.

**Current status:**
- **Awin integration** is fully active with **hundreds of advertisers** populating the system.
- Integrations for **Wix**, **WooCommerce**, and **Shopify** have been built and tested.
- However, we currently have **no live merchants using those platforms** in the dataset.
- Amazon Associates and eBay Partner Network are also active.

This merchant parts pipeline powers catalogue generation, AI recommendations, and the widgets shown to clubs.

**Key component:** [Lambdas/madeira-awin-clubscan](Lambdas/madeira-awin-clubscan) → [Full README](Lambdas/madeira-awin-clubscan/README.md)

### 🛡️ Self-Healing & Diagnostics

**[Lambdas/madeira-layer-cake](Lambdas/madeira-layer-cake)** is the dedicated **Layer Validation & Self-Healing Test Lambda**.

It exercises every major shared layer and serves as a canary to detect broken dependencies early.

**[Browse all Lambdas →](Lambdas/README.md)**

---

## 📁 Main Sections

- **[Layers](Layers)** — Shared code foundation
- **[API](API)** — Unified API Gateway + routes
- **[SQS](SQS)** — Background processing queues
- **[Lambdas](Lambdas)** — Specialised scheduled jobs
- **[S3-Bucket](S3-Bucket)** — JavaScript widgets
- **[HOST/partner](HOST/partner)** — Partner website templates
- **[RDS](RDS)** — Database schema

---

**Full detailed documentation is available in each subdirectory's `README.md` files.**

---

*Last updated: 14 June 2026*