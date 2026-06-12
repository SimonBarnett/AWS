# helpers.js

## Overview
Core shared utilities.

## Key Functions

| Function | Purpose |
|----------|---------|
| `executeWithRetry` | Resilient database operations |
| `enqueueMessage` | Trigger background work via SQS |
| `logger` | Structured logging |
| `normalizePhone` | Phone number formatting |
| `generatePin` | Generate 6-digit OTPs |

## Best Practice
Use these helpers instead of writing raw database or AWS SDK code in route files.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*