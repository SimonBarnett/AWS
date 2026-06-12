# helpers.js (Core Shared Helpers)

## Overview
Main shared utility module.

## Key Functions

| Function                    | Purpose |
|-----------------------------|---------|
| `executeWithRetry`          | Resilient DB operations |
| `enqueueMessage`            | SQS messaging |
| `getS3Client`               | S3 client |
| `logger`                    | Structured logging |
| `normalizePhone`            | Phone normalization |
| `generatePin`               | OTP generation |

## Best Practices
- Always use `executeWithRetry` for database calls
- Pass shared pool to handlers
- Use `enqueueMessage` for background work

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*