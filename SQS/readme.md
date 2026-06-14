# SQS Processing System — Madeira AWS

This directory contains **all background job processors** for the Club Madeira platform.

Madeira uses a **message-driven architecture** where heavy, long-running, or high-volume tasks are offloaded from the main API to dedicated SQS-triggered Lambdas.

---

## Why SQS?

- Decouples the API from slow operations
- Enables reliable retry, dead-letter handling and observability
- Allows easy horizontal scaling
- Supports complex multi-step pipelines with clear state transitions

---

## The Three Core Queues

| Queue Lambda                  | Responsibility                                      | Primary Consumers                  | Documentation |
|-------------------------------|-----------------------------------------------------|------------------------------------|---------------|
| **madeira-sqs-merchant**      | Ingest full product catalogues from merchant stores | Shopify, WooCommerce, Magento, BigCommerce, etc. | [readme.md](./madeira-sqs-merchant/readme.md) |
| **madeira-sqs-affiliate**     | Search affiliate networks + Grok AI relevance scoring | Awin, eBay, Amazon PA-API          | [readme.md](./madeira-sqs-affiliate/readme.md) |
| **madeira-sqs-catalogue**     | Orchestrate onboarding, category updates & catalogue building | API → SQS → DB + Widgets           | [readme.md](./madeira-sqs-catalogue/readme.md) |

---

## Common Design Patterns

- **Sandbox Mode**: Every pipeline respects the `sandbox` boolean for safe testing.
- **Self-Healing**: Stuck jobs are automatically detected and recovered.
- **Batching & S3 Chunking**: Large datasets are processed in controlled batches with keyset pagination.
- **Maintenance Windows**: Bulk operations respect `LASTS` table to protect database performance.
- **Event Flow**: API enqueues messages → SQS Lambdas process → status updated in DB → next step triggered.

---

## Navigation

Start here for each queue:

- [Merchant Pipeline](./madeira-sqs-merchant/readme.md)
- [Affiliate + Grok Pipeline](./madeira-sqs-affiliate/readme.md)
- [Catalogue Builder Pipeline](./madeira-sqs-catalogue/readme.md)

For the highest-level overview of the entire background system, see the main [SQS section in root README.md](../README.md#3-background-processing).

_Last updated: 14 June 2026_