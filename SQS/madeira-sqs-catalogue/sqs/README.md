# SQS Handlers (`sqs/`)

## Overview
Individual message handlers for the SQS Catalogue Processor.

## Handlers Overview

| Handler                    | Message Type                    | Purpose                              |
|----------------------------|---------------------------------|--------------------------------------|
| `onboarding.js`            | `ONBOARDING`                    | Background onboarding tasks          |
| `generate-review.js`       | `CLUBSCAN_GENERATE_REVIEW`      | Generate review content              |
| `generate-categories.js`   | `CLUBSCAN_GENERATE_CATEGORIES`  | Generate categories                  |
| `build-catalog.js`         | `CLUBSCAN_BUILD_CATALOG`        | Final catalog assembly               |
| `notify.js`                | `CLUBSCAN_NOTIFY`               | Send success/failure notifications   |
| `process-update.js`        | `CATEGORY_UPDATE`               | Handle category/content updates      |

## Common Pattern
1. Receive payload with `pool` and `sandbox`
2. Use `executeWithRetry` for DB work
3. Enqueue follow-up messages when needed
4. Handle errors and report batch failures

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*