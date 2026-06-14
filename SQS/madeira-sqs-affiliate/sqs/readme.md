# Madeira SQS Affiliate Pipeline – SQS Message Handlers

This document describes the SQS-driven processing pipeline inside `madeira-sqs-affiliate`.

## Overview

The affiliate pipeline has two main phases:

1. **Search Phase** — Fetch products from affiliate sources (Awin internal, eBay, Amazon PA-API) and store results in S3.
2. **Grok Relevance Phase** — Use xAI Grok to score which products are relevant for each club’s category/subcategory.

All heavy work is message-driven via SQS.

## Message Types

### 1. `PROCESS_CATEGORY`

**Purpose**: Fetch one batch of products from a specific affiliate source for a catalog.

**Triggered by**: Scheduler, manual trigger, or previous batch continuation.

**Payload**:
```json
{
  "type": "PROCESS_CATEGORY",
  "affiliate": "awin" | "ebay" | "paapi",
  "catalogId": 123,
  "userId": "ABC12345",
  "category": "Electronics",
  "subcategory": "Headphones",
  "searchterms": ["noise cancelling"],
  "lastId": 0
}
```

**Behavior** (in `affiliate.js`):
- Calls the corresponding route handler (`awin.run`, `eBay.run`, or `paapi.run`).
- Accumulates results into a **single S3 file** per affiliate/user/catalog.
- Uses `lastId` for keyset pagination.
- When the final batch is reached (`isLastBatch`), it:
  - Updates `CatalogAffiliateUpdates.Status = 'results_ready'`
  - Enqueues `GROK_BATCH`
- Otherwise, enqueues the next `PROCESS_CATEGORY` with the new `lastId`.

### 2. `GROK_BATCH`

**Purpose**: When affiliate search results are ready in S3, submit them to xAI Grok for relevance scoring.

**Payload**:
```json
{
  "type": "GROK_BATCH",
  "catalogId": 123,
  "affiliateKey": "awin"
}
```

**Behavior** (in `grokBatch.js`):
- Reads the full results JSON from S3.
- Splits products into small chunks (default `GROK_BATCH_SIZE=10`).
- Builds structured batch requests with a relevance evaluation system prompt.
- Submits the batch to xAI using `submitStructuredBatch`.
- Stores the xAI `batch_id` in `CatalogAffiliateUpdates.BatchName`.
- Includes self-healing logic for stuck records.

### 3. `GROK_POLL`

**Purpose**: Poll xAI for completion of Grok batches and process the results.

**Two modes**:

**Discovery Mode** (no `batchNames` in payload):
- Finds all records with `Status = 'batch_submitted'` that are ready for checking.
- Enqueues a chained `GROK_POLL` message containing the list of batch names.

**Chained Processing Mode**:
- Processes one batch at a time.
- After processing, enqueues the remaining batches (if any).
- This prevents overwhelming the system with concurrent polls.

**When a batch finishes successfully** (`handleCompletedBatch`):
- Downloads Grok results.
- Matches decisions back to original products.
- Inserts rejected ASINs into `RejectedAsins`.
- Upserts relevant products into the `Products` table.
- Deletes the temporary S3 results file.
- Marks the record as `completed`.

## S3 / Batching / Chunking Strategy

### Affiliate Results Storage

- All results for one affiliate + user + catalog are stored in **one JSON file** in S3.
- Path pattern: `{affiliate}/{userId}/{catalogId}.json`
- Results are **appended** across multiple `PROCESS_CATEGORY` batches.
- This design keeps the number of S3 objects low.

### Grok Batching & Chunking

When `GROK_BATCH` runs:

- The full product list is read from S3.
- It is split into chunks of size `GROK_BATCH_SIZE` (default **10**).
- Each chunk is sent as a separate structured batch request to xAI.
- This keeps token usage per request reasonable and allows parallel processing on xAI’s side.
- Token estimation uses `calculateRecommendedMaxTokens` with the relevance schema.

**Why small chunks?**
- xAI batch API has practical limits per request.
- Better error isolation (one bad chunk doesn’t kill the whole job).
- More granular progress tracking.

## Self-Healing & Resilience

The system includes several self-healing mechanisms:

- Stuck `results_ready` records without a `BatchName` are re-enqueued as `GROK_BATCH`.
- Stuck `polling` records are reset after 15 minutes.
- Very old `batch_submitted` records (>24h) are reset to `results_ready`.
- Missing S3 files during processing trigger cleanup and reset.

## Full End-to-End Flow

1. Scheduler / manual trigger → `PROCESS_CATEGORY` (lastId=0)
2. Affiliate route returns first batch → written to S3
3. If more results → enqueue next `PROCESS_CATEGORY` with new `lastId`
4. Final batch → mark `results_ready` + enqueue `GROK_BATCH`
5. `GROK_BATCH` → split into chunks → submit to xAI
6. `GROK_POLL` (discovery) → finds submitted batches → chains processing
7. `GROK_POLL` processes each batch:
   - Waits for xAI completion
   - Applies relevance decisions
   - Upserts relevant products
   - Records rejections
   - Cleans up S3 file
8. Cycle complete for that catalog + affiliate

## Environment Variables

| Variable                | Default | Used For                              |
|-------------------------|---------|---------------------------------------|
| `AFFILIATE_BATCH_SIZE`  | 100     | Affiliate search batch size           |
| `GROK_BATCH_SIZE`       | 10      | Products per Grok structured batch    |
| `MAX_TEXT`              | 500     | Max characters for features/description |
| `S3_RESULTS_BUCKET`     | -       | Bucket for temporary affiliate results |

## Notes

- The `awin` affiliate source searches the `MerchantProducts` table (products imported via the merchant pipeline). This is the bridge between merchant onboarding and affiliate search.
- All affiliate results go through Grok relevance filtering before being shown to users.
- The design emphasizes **resilience** and **incremental progress** via `lastId` pagination and chained polling.

---

**Last updated:** 14 June 2026