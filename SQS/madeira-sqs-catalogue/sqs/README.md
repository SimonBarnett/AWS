# SQS Handlers (`sqs/`)

## Overview
This folder contains individual message handlers for the SQS Catalogue Processor.

Each file handles a specific message type or related group of operations.

## Handlers

### `onboarding.js`
**Message Type:** `ONBOARDING`
Handles background tasks related to user onboarding.

### `generate-review.js`
**Message Type:** `CLUBSCAN_GENERATE_REVIEW`
Generates review content for a URL.

### `generate-categories.js`
**Message Type:** `CLUBSCAN_GENERATE_CATEGORIES`
Generates category suggestions.

### `build-catalog.js`
**Message Type:** `CLUBSCAN_BUILD_CATALOG`
Final assembly of the complete catalog.

### `notify.js`
**Message Type:** `CLUBSCAN_NOTIFY`
Sends success/failure notifications after processing.

### `process-update.js`
**Message Type:** `CATEGORY_UPDATE`
Handles updates to categories or content.

## Common Pattern
1. Receive enriched payload (includes `pool` and `sandbox`)
2. Perform work using `executeWithRetry`
3. May enqueue follow-up messages
4. Handle errors gracefully and report `batchItemFailures` when needed

## Related Components
- Main router: `index.js`
- Email logic: `emails.js`
- `clubscan` status in RDS

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*