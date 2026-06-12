# SQS Handlers (`sqs/`)

## Overview
This folder contains the handlers for different SQS message types.

## Handlers

| File | Message Type | Purpose |
|------|--------------|---------|
| `onboarding.js` | `ONBOARDING` | Background onboarding tasks |
| `generate-review.js` | `CLUBSCAN_GENERATE_REVIEW` | Generate review content |
| `generate-categories.js` | `CLUBSCAN_GENERATE_CATEGORIES` | Generate categories |
| `build-catalog.js` | `CLUBSCAN_BUILD_CATALOG` | Final catalog assembly |
| `notify.js` | `CLUBSCAN_NOTIFY` | Send notifications |
| `process-update.js` | `CATEGORY_UPDATE` | Handle updates |

## Common Pattern
All handlers receive a payload containing the database pool and sandbox flag. They use `executeWithRetry` for database operations and can enqueue follow-up messages.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*