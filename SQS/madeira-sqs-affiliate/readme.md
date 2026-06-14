# Madeira SQS Affiliate Pipeline

`madeira-sqs-affiliate` is the Lambda responsible for **searching affiliate product sources** and running AI-powered relevance filtering using xAI Grok.

It powers the searchable affiliate layer that supplements the merchant-imported products.

## Purpose

- Search live affiliate networks (Amazon PA-API, eBay) and the internal merchant product pool (via the `awin` source)
- Store results temporarily in S3
- Use Grok to score which products are relevant for each club’s categories
- Insert relevant products into the live `Products` table
- Record rejected products in `RejectedAsins`

## Environment Variables

| Variable                          | Default | Description                                                                 |
|-----------------------------------|---------|-----------------------------------------------------------------------------|
| `AFFILIATES`                      | -       | Comma-separated list of active affiliate sources (e.g. `awin,ebay`)         |
| `AFFILIATE_BATCH_SIZE`            | 100     | Number of products to fetch per affiliate search batch                      |
| `INDEX_REBUILD_THRESHOLD_MINUTES` | 60      | Threshold used for index rebuild decisions (if applicable)                  |
| `LOG_LEVEL`                       | info    | Logging verbosity (`debug`, `info`, `warn`, `error`)                        |
| `S3_RESULTS_BUCKET`               | -       | S3 bucket used to temporarily store affiliate search results                |
| `SQS_QUEUE_URL`                   | -       | URL of the affiliate processing queue                                       |
| `TOP`                             | 5       | Used by scheduler to limit number of catalogs processed per run             |

## Sandbox Mode

The `sandbox` flag is passed through almost every message in this pipeline.

**When `sandbox: true`:**
- Many database writes are skipped or use test markers instead of real data
- Grok calls may be limited or use test configurations
- Status updates in `CatalogAffiliateUpdates` still occur for traceability
- Useful for safe testing of new affiliate sources or Grok prompt changes without affecting live data

The flag flows from the initial trigger all the way through `PROCESS_CATEGORY` → `GROK_BATCH` → `GROK_POLL`.

## Stale Pair / Catalog Selection Logic

The system does **not** refresh every catalog on every run. It intelligently selects which (**Catalog + Affiliate**) combinations are "stale" and need updating.

### Core Table: CatalogAffiliateUpdates

This table is the **single source of truth** for the freshness of affiliate data per catalog.

Relevant columns:
- `CatalogId` + `AffiliateKey` (the "pair")
- `Status` (`results_ready`, `batch_submitted`, `polling`, `completed`)
- `LastUpdate`
- `NextCheck`
- `S3File` / `BatchName`

### When Is a Pair Considered Stale?

A pair becomes eligible for re-processing when **any** of these conditions are met:

1. **Never processed** — No record exists for this catalog + affiliate combination.
2. **Completed but old** — `Status = 'completed'` and `LastUpdate` is older than the acceptable freshness window.
3. **Stuck in processing** — Records stuck in `batch_submitted` or `polling` for too long are automatically reset by self-healing logic in `grokPoll.js`.
4. **Explicit trigger** — Manual runs or scheduler can force specific catalogs.

### How the Scheduler Selects Stale Pairs

When triggered with:

```json
{
  "task": "scheduler",
  "sandbox": true,
  "TOP": 5
}
```

The scheduler:
- Queries `CatalogAffiliateUpdates` for stale records (primarily based on `LastUpdate` age).
- Orders them by `LastUpdate ASC` (oldest/stalest first — ensures fairness).
- Limits the selection to the number specified in `TOP`.
- Enqueues `PROCESS_CATEGORY` messages for each selected pair.

This design provides controlled, prioritized, and observable processing.

### Comparison to Merchant Side

| Aspect                  | Merchant (`UserApiKeys`)              | Affiliate (`CatalogAffiliateUpdates`)          |
|-------------------------|---------------------------------------|------------------------------------------------|
| What is tracked         | Merchant API connection               | Catalog + Affiliate combination                |
| Staleness control       | `MIN_AGE_HOURS` + `LastStatus`        | `LastUpdate` + status-based rules              |
| Selection function      | `getEligibleMerchants()`              | Scheduler query on `CatalogAffiliateUpdates`   |
| Throttling              | Sequential via `lastId`               | `TOP` parameter                                |

## Message Flow Overview

1. **Scheduler / Manual Trigger** → `PROCESS_CATEGORY` messages
2. Affiliate search results are accumulated in S3 (one file per affiliate + catalog)
3. When complete → `GROK_BATCH` is enqueued
4. `GROK_BATCH` splits products into small chunks and submits to xAI
5. `GROK_POLL` discovers and processes completed Grok batches
6. Relevant products are inserted/updated; rejected ones are recorded

**Detailed documentation:**
- [Routes (Affiliate Connectors)](./routes/readme.md)
- [SQS Message Handlers](./sqs/readme.md)

## Test Invocation Scripts

### 1. Scheduler Trigger (starts affiliate processing for top N catalogs)

```json
{
  "task": "scheduler",
  "sandbox": true,
  "TOP": 5
}
```

- `task: "scheduler"` tells the Lambda to act as a scheduled run.
- `TOP` limits how many catalogs are processed in this invocation.
- Use `sandbox: true` during testing.

### 2. Manual GROK_POLL Trigger

```json
{
  "task": "GROK_POLL",
  "sandbox": false
}
```

- Forces the system to check for completed Grok batches and process them.
- Useful for debugging or manually progressing stuck jobs.

## Key Files

```
SQS/madeira-sqs-affiliate/
├── index.js                 # Main entry point
├── routes/                  # Search connectors
│   ├── awin.js              # Internal MerchantProducts search
│   ├── eBay.js
│   ├── paapi.js             # Amazon PA-API
│   └── readme.md            # ← Detailed connector documentation
├── sqs/                     # Message handlers
│   ├── affiliate.js         # PROCESS_CATEGORY handler + S3 accumulation
│   ├── grokBatch.js         # Submits chunks to xAI Grok
│   ├── grokPoll.js          # Polls and finalizes Grok results
│   └── readme.md            # ← Detailed message types & batching docs
└── readme.md                # ← You are here
```

## Related Documentation

- [Affiliate Search Connectors (Routes)](./routes/readme.md)
- [SQS Message Handlers & Grok Flow](./sqs/readme.md)

---

**Last updated:** 14 June 2026