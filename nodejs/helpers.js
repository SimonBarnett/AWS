# helpers.js

## Overview
Core shared utilities.

## Key Functions

| Function | Purpose |
|----------|---------|
| `executeWithRetry` | Safe DB operations with retry |
| `enqueueMessage` | Send SQS messages |
| `logger` | Structured logging |
| `normalizePhone` | Phone formatting |
| `generatePin` | OTP generation |

## Recommendation
Use these instead of raw SDK calls in routes.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*