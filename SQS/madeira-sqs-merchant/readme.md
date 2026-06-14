# Madeira SQS Merchant Pipeline

`madeira-sqs-merchant` is the Lambda responsible for periodically synchronizing product data from merchants' connected e-commerce platforms into Madeira.

It acts as the **ingestion and merge engine** for all merchant product feeds.

## High-Level Purpose

- Pull products from Shopify, WooCommerce, Magento, BigCommerce, Wix, and Awin
- Normalize them into a common format
- Efficiently merge them into Madeira's database using batch processing
- Keep merchant data reasonably fresh without overloading the system

## Architecture

The system is split into two main layers:

### 1. Platform Connectors (`/routes`)

These are the **data fetchers**. Each file is a specialized connector for one platform.

**See:** [routes/readme.md](./routes/readme.md) for full details on each connector, required credentials, and how they normalize data.

### 2. SQS Message Handlers (`/sqs`)

These handle the **orchestration and batch processing** logic via SQS messages.

**See:** [sqs/readme.md](./sqs/readme.md) for the full message types, environment variables, maintenance window logic, and stale merchant processing.

## How a Full Sync Cycle Works

1. **Trigger** — A CloudWatch scheduled event (or manual trigger) starts the process.
2. **Maintenance Window** — `MAINTAINANCE_WINDOW` message disables database indexes for fast bulk loading.
3. **Index Wait** — `WAIT_INDEX` polls until indexes are confirmed disabled.
4. **Merchant Processing** — `PROCESS_MERCHANT` messages walk through eligible merchants one by one (in `Id` order).
5. **Provider Fetch** — The correct connector from `/routes` is called based on the merchant's `api_key_type`.
6. **Batching** — Products are split into chunks, uploaded to S3, and `MERGE_BATCH` messages are enqueued.
7. **Merge** — Each `MERGE_BATCH` performs a set-based merge into the database.
8. **Cleanup** — `FINAL_CLEANUP` updates status and triggers the next merchant.
9. **Rebuild Indexes** — Once all merchants are done, `GLOBAL_REBUILD` re-enables indexes.

The entire flow is designed to be **resilient** — if one merchant fails, the pipeline continues with the next one.

## Key Concepts

### Stale Merchant Detection

A merchant becomes eligible for re-processing when:
- They have never been processed, or
- Their last successful sync is older than `MIN_AGE_HOURS` (default 48 hours), or
- They had an error and enough time has passed.

Processing always happens in ascending `Id` order using a `lastId` chain. This prevents duplicates and guarantees deterministic behavior.

### Sandbox Mode

Every message carries a `sandbox` flag. When `true`:
- Real index disable/rebuild stored procedures are skipped
- Only audit markers in the `LASTS` table are used
- Useful for safe testing of new connectors or major changes

### Maintenance Window

All heavy merchant processing is **gated** behind an active `MAINTAINANCE_WINDOW` record in the `LASTS` table. This prevents accidental overlapping runs and protects database performance.

## Environment Variables

| Variable                        | Purpose                                      | Default |
|--------------------------------|----------------------------------------------|---------|
| `DB_BATCH_SIZE`                | Products per S3 batch / merge operation      | 3500    |
| `MIN_AGE_HOURS`                | How old data must be before re-processing    | 48      |
| `S3_RESULTS_BUCKET`            | Temporary storage for product batches        | -       |
| `SQS_QUEUE_URL`                | Target queue for internal messages           | -       |

## Folder Structure

```
SQS/madeira-sqs-merchant/
├── index.js                 # Main orchestrator
├── merchantEligibility.js   # Stale merchant detection logic
├── package.json
├── routes/                    # Platform connectors
│   ├── awin.js
│   ├── bigCommerce.js
│   ├── magento.js
│   ├── shopify.js
│   ├── wixStore.js
│   ├── wooCommerce.js
│   └── readme.md            # ← Detailed connector docs
└── sqs/                       # SQS message handlers
    ├── processMerchant.js
    ├── mergeBatch.js
    ├── finalCleanup.js
    └── readme.md            # ← Detailed message & flow docs
```

## Related Documentation

- [Platform Connectors (Routes)](./routes/readme.md)
- [SQS Message Handlers](./sqs/readme.md)

---

**Last updated:** 14 June 2026