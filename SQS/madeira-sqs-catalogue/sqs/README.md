# SQS Handlers (`sqs/`)

## Overview
This folder contains individual message handlers for the SQS Catalogue Processor.

Each file handles a specific message type or related group of operations in the asynchronous processing pipeline.

## Contents

| File                          | Message Type(s)                     | Purpose |
|-------------------------------|-------------------------------------|--------|
| `onboarding.js`               | `ONBOARDING`                        | Background onboarding tasks |
| `generate-review.js`          | `CLUBSCAN_GENERATE_REVIEW`          | Generate review content |
| `generate-categories.js`      | `CLUBSCAN_GENERATE_CATEGORIES`      | Generate categories |
| `build-catalog.js`            | `CLUBSCAN_BUILD_CATALOG`            | Final catalog assembly |
| `notify.js`                   | `CLUBSCAN_NOTIFY`                   | Send notifications |
| `process-update.js`           | `CATEGORY_UPDATE`                   | Handle updates |

## Pattern
Most handlers:
1. Receive enriched payload (with `pool` and `sandbox`)
2. Perform work using `executeWithRetry`
3. May enqueue follow-up messages
4. Handle errors gracefully

## Related Components
- Main router: `index.js`
- Email logic: `emails.js` (parent folder)
- `clubscan` status tracking in RDS

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*