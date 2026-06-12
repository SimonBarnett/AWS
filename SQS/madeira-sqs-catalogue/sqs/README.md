# SQS Handlers (`sqs/`)

## Overview
Handlers for specific SQS message types.

## Handlers

| File | Message Type | Purpose |
|------|--------------|---------|
| `onboarding.js` | `ONBOARDING` | Background onboarding work |
| `generate-review.js` | `CLUBSCAN_GENERATE_REVIEW` | Review generation |
| `generate-categories.js` | `CLUBSCAN_GENERATE_CATEGORIES` | Category generation |
| `build-catalog.js` | `CLUBSCAN_BUILD_CATALOG` | Final catalog assembly |
| `notify.js` | `CLUBSCAN_NOTIFY` | Notifications |
| `process-update.js` | `CATEGORY_UPDATE` | Content updates |

## Pattern
Receive payload → Use shared pool → Do work → Enqueue next step if needed.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*