# helpers.js

## Overview
Core shared utilities for all Lambdas.

## Key Functions

| Function | Purpose |
|----------|---------|
| `executeWithRetry` | Database operations with retry logic |
| `enqueueMessage` | Send messages to SQS |
| `logger` | Structured logging |
| `normalizePhone` | Phone number normalization |
| `generatePin` | Generate 6-digit OTPs |

## Best Practice
Use these helpers instead of writing raw code in route files.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*