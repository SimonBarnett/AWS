# SQS Handlers (`sqs/`)

## Overview
This folder contains the individual handlers for different SQS message types.

## Handler Summary

| File | Message Type | Main Responsibility |
|------|--------------|---------------------|
| `onboarding.js` | `ONBOARDING` | Post-onboarding background work |
| `generate-review.js` | `CLUBSCAN_GENERATE_REVIEW` | Generate review content |
| `generate-categories.js` | `CLUBSCAN_GENERATE_CATEGORIES` | Generate categories |
| `build-catalog.js` | `CLUBSCAN_BUILD_CATALOG` | Final catalog assembly |
| `notify.js` | `CLUBSCAN_NOTIFY` | Send notifications |
| `process-update.js` | `CATEGORY_UPDATE` | Handle updates |

## Common Implementation Pattern
1. Receive message with `pool` and `sandbox`
2. Perform database work using `executeWithRetry`
3. Enqueue follow-up messages when needed
4. Handle errors and report partial failures

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*