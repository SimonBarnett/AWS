# helpers.js

## Overview
Core shared utilities for all Lambdas.

## Most Important Functions

| Function | Use Case |
|----------|----------|
| `executeWithRetry` | Safe database operations |
| `enqueueMessage` | Trigger background jobs via SQS |
| `logger` | Consistent logging |
| `normalizePhone` | Phone formatting |
| `generatePin` | OTP generation |

## Recommendation
Use these helpers instead of writing raw AWS SDK or database code in routes.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*