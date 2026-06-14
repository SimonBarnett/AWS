# Madeira AWS - Club Madeira Platform

**Full production AWS infrastructure** powering the Club Madeira Affiliate Programme, Smart Product Catalogues, Merchant Recommendations, Partner Tools, and Widget Distribution.

---

## 🌟 Big Picture Architecture

This system is built with a **layer-first, modular philosophy**. Everything is designed for maximum code reuse, consistency, and maintainability through shared Lambda Layers.

### 🔥 Merchant Discovery & Parts Ingestion (Awin + others)

A core capability of the platform is the ability to pull real merchant products and parts from affiliate networks.

The system currently integrates with **Amazon**, **eBay**, and **Awin**. 

**Note on "Awin"**: In database searches, queues, and Lambdas, "Awin" often refers to the broad merchant ingestion pipeline. This pipeline is architected to eventually include parts from many platforms (Wix, Shopify, WooCommerce, Magento, etc.). **We do not yet have active integrations for those specific platforms** — currently the pipeline is populated primarily by native Awin merchants (plus Amazon and eBay).

This merchant parts data is **foundational**: it powers catalogue generation, AI recommendations, and the actual product listings shown to clubs via widgets.

**Key component:** [Lambdas/madeira-awin-clubscan](Lambdas/madeira-awin-clubscan) → [Full README](Lambdas/madeira-awin-clubscan/README.md)

### 🛡️ Self-Healing & Diagnostics

**[Lambdas/madeira-layer-cake](Lambdas/madeira-layer-cake)** is the official **Layer Validation & Self-Healing Test Lambda**.

It exercises every major shared layer to act as a canary and ensure the layered architecture remains healthy.

**[Browse all Lambdas →](Lambdas/README.md)**

---

## 📁 Main Sections

- **[Layers](Layers)** — Shared code foundation (`helpers`, `grok`, `payments`, `auth`)
- **[API](API)** — Unified API Gateway + token, UI, and query routes
- **[SQS](SQS)** — Background processing queues (catalogue, merchant, affiliate)
- **[Lambdas](Lambdas)** — Specialised scheduled & triggered jobs
- **[S3-Bucket](S3-Bucket)** — JavaScript widgets used by partners and clubs
- **[HOST/partner](HOST/partner)** — Templates for partner websites
- **[RDS](RDS)** — Database schema and stored procedures

---

**Full detailed documentation continues in each subdirectory's `README.md` files.**

Last updated: 14 June 2026

---

*Continue exploring the linked folders above for complete architecture, configuration, and operational details.*