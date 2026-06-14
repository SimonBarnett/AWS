# Madeira SQS Merchant Pipeline – SQS Message Handlers

This document describes the SQS message-driven pipeline inside `madeira-sqs-merchant`.

The system is responsible for periodically pulling product data from merchants' connected stores (Shopify, WooCommerce, Magento, BigCommerce, Wix, Awin) and merging it into Madeira's catalogue.

## Architecture Overview

The pipeline is deliberately **serial per merchant** but highly parallel across batches:

1. A scheduled CloudWatch event triggers the pipeline.
2. A `MAINTAINANCE_WINDOW` message disables indexes and starts the process.
3. Merchants are processed **one by one** in `Id` order (oldest first).
4. Each merchant's products are split into batches, uploaded to S3, then processed via `MERGE_BATCH` messages.
5. After all merchants finish, a `GLOBAL_REBUILD` re-enables indexes.

All heavy work is offloaded to SQS so the Lambda stays responsive.

## Environment Variables

| Variable                        | Default | Purpose                                                                 | Used In                  |
|--------------------------------|---------|-------------------------------------------------------------------------|--------------------------|
| `DB_BATCH_SIZE`                | 3500    | Number of products per S3 batch / DB merge operation                    | `processMerchant`, `mergeBatch` |
| `FINAL_CLEANUP_DELAY_MS`       | 4000    | Delay before running final cleanup after last batch                     | `finalCleanup`           |
| `LARGE_MERCHANT_BATCH_THRESHOLD` | 4     | Threshold used to decide special handling for very large merchants      | (future / merge logic)   |
| `LOG_LEVEL`                    | debug   | Controls logging verbosity                                              | All modules              |
| `MERGE_BATCH_ENQUEUE_DELAY_MS` | 120     | Small delay between enqueuing MERGE_BATCH messages                      | `index.js`               |
| `MIN_AGE_HOURS`                | 48      | Minimum age (in hours) before a merchant is considered eligible again   | `merchantEligibility`    |
| `S3_RESULTS_BUCKET`            | -       | S3 bucket used to temporarily store product batches                     | All S3 operations        |
| `SQS_QUEUE_URL`                | -       | URL of the merchant processing queue (FIFO or standard)                 | All `enqueueMessage` calls |

> **Note**: `MIN_AGE_HOURS` is the main control for **stale merchant detection**.

## Message Types

### 1. `MAINTAINANCE_WINDOW`

**Purpose**: Starts a full merchant sync cycle. Disables database indexes for bulk loading performance.

**Triggered by**: Scheduled CloudWatch Event (usually daily or weekly).

**Payload**:
```json
{
  "type": "MAINTAINANCE_WINDOW",
  "sandbox": true
}
```

**Behavior**:
- Checks if a maintenance window is already active (via `LASTS` table).
- If not active, inserts/updates `MAINTAINANCE_WINDOW` row in `LASTS`.
- Calls `DisableMerchantIndexes` (or sandbox equivalent).
- Enqueues a `WAIT_INDEX` message.

**Important**: Only one maintenance window can be active at a time.

### 2. `WAIT_INDEX`

**Purpose**: Polling mechanism to wait until indexes are confirmed disabled before starting merchant processing.

**Payload**:
```json
{
  "type": "WAIT_INDEX",
  "sandbox": true
}
```

**Behavior**:
- Checks for `IndexesBulkLoadDisabled` flag in `LASTS` table.
- If present → enqueues `PROCESS_MERCHANT` with `lastId: 0`.
- If not present → re-runs `DisableMerchantIndexes` and re-enqueues itself with a 20-second delay.

This prevents processing from starting before indexes are ready.

### 3. `PROCESS_MERCHANT`

**Purpose**: Processes a single merchant's product feed.

**Payload**:
```json
{
  "type": "PROCESS_MERCHANT",
  "userApiKeyId": 12345,        // optional – for manual single merchant test
  "lastId": 12345,              // used for sequential pagination
  "sandbox": true,
  "manual": true                  // when triggered manually
}
```

**Key Logic**:
- Uses `getEligibleMerchants()` to find the next merchant that hasn't been processed recently.
- Fetches credentials from `UserApiKeys.api_key_data`.
- Calls the appropriate provider connector (Shopify, WooCommerce, etc.).
- Splits results into batches → uploads to S3.
- Enqueues the first `MERGE_BATCH` message.
- On error, marks the merchant as failed and continues to the next one.

**Stale Merchant Detection** (see below).

### 4. `MERGE_BATCH`

**Purpose**: Merges one chunk of products from S3 into the database using `OPENJSON` + `MERGE`.

**Payload** (example):
```json
{
  "type": "MERGE_BATCH",
  "userId": "ABC12345",
  "description": "My Shopify Store",
  "source": "shopify",
  "batchId": "uuid-here",
  "fileIndex": 0,
  "chunkIndex": 0,
  "totalFiles": 3,
  "s3Key": "merchant-batches/xxx/batch-0001.json",
  "sandbox": true
}
```

**Behavior**:
- Downloads the JSON batch from S3.
- Performs a set-based `MERGE` into the merchant product tables.
- Tracks insert/update/delete counts.
- After the last chunk of the last file → enqueues `FINAL_CLEANUP`.

### 5. `FINAL_CLEANUP`

**Purpose**: Performs final status updates and housekeeping after a merchant's batches are fully merged.

**Payload**:
```json
{
  "type": "FINAL_CLEANUP",
  "userId": "ABC12345",
  "description": "My Shopify Store",
  "source": "shopify",
  "batchId": "uuid-here",
  "sandbox": true
}
```

**Behavior**:
- Updates `UserApiKeys` with final counts and status `200`.
- Enqueues the next `PROCESS_MERCHANT` message (with the current merchant's `Id` as `lastId`).
- This continues the sequential chain until no more eligible merchants remain.

### 6. `GLOBAL_REBUILD`

**Purpose**: Final step of the entire cycle. Re-enables database indexes.

**Payload**:
```json
{
  "type": "GLOBAL_REBUILD",
  "sandbox": true
}
```

**Behavior**:
- Calls `StartAsyncIndexRebuild` (production) or cleans up sandbox flags.
- This is only triggered **once**, after the very last merchant has been processed (from inside `processMerchant.js`).

## The `sandbox` Parameter

The `sandbox` flag is passed through **every message** in the pipeline.

**Where it is used**:
- In `index.js`: Controls whether real stored procedures (`DisableMerchantIndexes`, `StartAsyncIndexRebuild`) are called or whether only `LASTS` table markers are used.
- In `processMerchant.js`: Passed to `getEligibleMerchants` and to provider handlers.
- In all SQS sub-handlers: Controls logging verbosity and whether certain destructive operations are skipped.
- When `sandbox: true`, the system is much more conservative and leaves audit trails in the `LASTS` table.

This allows safe testing without affecting production indexes or data.

## How Stale Merchants Are Discovered

The single source of truth is `merchantEligibility.js` → `getEligibleMerchants()`.

**Eligibility Rules** (from `UserApiKeys`):

A merchant is considered **eligible** if:

- `api_key_data` is not empty
- **AND** one of the following is true:
  - `LastStatus` is `NULL` or `0`
  - `LastStatus = 200` **and** `updated_at` is older than `MIN_AGE_HOURS`
  - `LastStatus` is an error code **and** `updated_at` is older than 23 hours

**Processing Order**:
- Always processes in ascending `Id` order (`ORDER BY Id ASC`).
- Uses `lastId` parameter to continue from where the previous merchant left off.
- This guarantees **deterministic, non-overlapping** processing even if multiple cycles overlap slightly.

**Why this design?**
- Prevents the same merchant from being processed too frequently.
- Allows failed merchants to be retried relatively quickly (23h) while successful ones wait the full `MIN_AGE_HOURS` (default 48h / 7 days in some configs).
- The `lastId` chain ensures we never re-process a merchant in the same cycle.

## Scheduler Event

The pipeline is normally started by a CloudWatch scheduled event with this minimal payload:

```json
{
  "sandbox": true
}
```

This event has **no `type`**, so `index.js` treats it as a direct invocation and routes it to `processMerchant` (after the maintenance window has been established).

## Full Flow Summary

1. Scheduler → `{ "sandbox": true }`
2. `index.js` sees no `type` → calls `processMerchant`
3. `processMerchant` sees no active maintenance window → does nothing (or waits)
4. Maintenance window is started manually or via separate trigger
5. `MAINTAINANCE_WINDOW` → disables indexes → `WAIT_INDEX`
6. `WAIT_INDEX` confirms indexes disabled → `PROCESS_MERCHANT` (lastId=0)
7. `PROCESS_MERCHANT` loops through merchants:
   - Fetch from provider → S3 batches → first `MERGE_BATCH`
8. `MERGE_BATCH` messages process chunks → last one triggers `FINAL_CLEANUP`
9. `FINAL_CLEANUP` → next `PROCESS_MERCHANT` (with current Id as lastId)
10. When no more merchants → `GLOBAL_REBUILD` (re-enable indexes)

## Notes for Maintainers

- The entire pipeline is designed to be **resilient**. If one merchant fails, the chain continues.
- `sandbox` mode should always be used for testing new connectors or major changes.
- `MIN_AGE_HOURS` is the primary tuning knob for how fresh merchant data should be.
- All status updates go through `updateApiKeyStatus()` so the UI can show progress.

---

**Last updated:** 14 June 2026