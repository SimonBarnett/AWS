# helpers.js (Core Shared Helpers)

## Overview
Main shared utility module. Contains commonly used functions across the system.

## Key Exports

| Function                    | Purpose |
|-----------------------------|---------|
| `executeWithRetry`          | Resilient database operations |
| `enqueueMessage`            | Send SQS messages |
| `getS3Client`               | S3 client factory |
| `logger`                    | Structured logging |
| `normalizePhone`            | Phone number normalization |
| `generatePin`               | 6-digit OTP generation |

## Important Patterns
- Always use `executeWithRetry` for DB calls
- Pass shared pool instead of creating new connections
- Use `enqueueMessage` for background work

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*