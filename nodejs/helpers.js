# helpers.js

## Overview
Core shared utilities for all Lambdas.

## Key Functions

| Function | Purpose |
|----------|---------|
| `executeWithRetry` | Resilient database operations |
| `enqueueMessage` | Send SQS messages |
| `logger` | Structured logging |
| `normalizePhone` | Phone formatting |
| `generatePin` | OTP generation |

## Best Practice
Use these helpers instead of writing raw code in routes.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*