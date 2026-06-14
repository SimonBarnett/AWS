# SQS Processing Layer

This folder contains the **message-driven processing Lambdas** that power Madeira’s background jobs.

These Lambdas are triggered primarily by SQS queues and handle heavy, asynchronous work such as:

- Importing merchant product catalogues
- Searching affiliate networks
- Running AI relevance scoring (Grok)
- Building and maintaining the live catalogue

## Architecture Principles

- **Event-driven**: Most work is triggered by SQS messages rather than direct API calls.
- **Resilient**: Self-healing logic, retries, and graceful degradation are built in.
- **Sandbox support**: Every major pipeline supports a `sandbox` flag for safe testing.
- **Batching & Chunking**: Large jobs are broken into manageable batches (S3 + keyset pagination).
- **Separation of concerns**: Data fetching (routes) is separated from orchestration and batch processing (sqs).

## The Three SQS Lambdas

| Lambda                        | Purpose                                              | Key Message Types                          | Documentation |
|-------------------------------|------------------------------------------------------|--------------------------------------------|---------------|
| `madeira-sqs-merchant`        | Imports full product catalogues from merchant stores | `PROCESS_MERCHANT`, `MERGE_BATCH`, `FINAL_CLEANUP`, `MAINTAINANCE_WINDOW` | [readme.md](./madeira-sqs-merchant/readme.md) |
| `madeira-sqs-affiliate`       | Searches affiliate sources + runs Grok relevance     | `PROCESS_CATEGORY`, `GROK_BATCH`, `GROK_POLL` | [readme.md](./madeira-sqs-affiliate/readme.md) |
| `madeira-sqs-catalogue`       | Builds and maintains the live searchable catalogue   | `ONBOARDING`, `CATEGORY_UPDATE`, `CLUBSCAN_*` | [readme.md](./madeira-sqs-catalogue/readme.md) |

## Common Patterns Across Pipelines

### Maintenance / Processing Windows
Many pipelines are gated behind a maintenance window record (stored in the `LASTS` table) to protect database performance during bulk operations.

### Sandbox Mode
Almost every message carries a `sandbox: true/false` flag. When enabled:
- Destructive or heavy database operations are skipped or simulated
- Audit markers are written instead of calling real stored procedures

### S3 + Batching Strategy
Large result sets are written to S3 and processed in chunks using `lastId` keyset pagination. This keeps Lambda memory usage low and allows resumable processing.

### Self-Healing
Stuck records (e.g. `batch_submitted` older than 24h, or `polling` older than 15 minutes) are automatically detected and reset or re-enqueued.

## Folder Structure

```
SQS/
├── madeira-sqs-merchant/
│   ├── index.js
│   ├── routes/          # Platform connectors (Shopify, WooCommerce, etc.)
│   ├── sqs/             # Message handlers
│   └── readme.md        # ← Start here
│
├── madeira-sqs-affiliate/
│   ├── routes/          # Search connectors (Awin internal, eBay, Amazon PA-API)
│   ├── sqs/             # Search + Grok orchestration
│   └── readme.md
│
└── madeira-sqs-catalogue/   # Catalogue building pipeline
    └── readme.md
```

## Getting Started

1. Start with the top-level `readme.md` inside each Lambda folder.
2. Then drill into `routes/readme.md` for data source details.
3. Finally read `sqs/readme.md` for message types, batching logic, and flow.

---

**Last updated:** 14 June 2026