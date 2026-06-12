# SQS Handlers (`sqs/`)

## Overview
Individual handlers for SQS message types in the ClubScan and background processing pipeline.

## Handler Details

### `onboarding.js`
Handles background work after user onboarding (e.g. triggering initial ClubScan jobs).

### `generate-review.js`
Generates review content for a newly onboarded URL.

### `generate-categories.js`
Generates category suggestions.

### `build-catalog.js`
Final step — assembles the complete catalog.

### `notify.js`
Sends success/failure notifications (emails).

### `process-update.js`
Handles incremental updates to categories or content.

## Common Pattern
All handlers receive a payload that includes the database pool and sandbox flag. They use `executeWithRetry` for DB operations and can enqueue follow-up messages.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*