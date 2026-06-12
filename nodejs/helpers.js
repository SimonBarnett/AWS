# helpers.js (Core Shared Helpers)

## Overview
Main shared utility module in the Lambda Layer. Contains commonly used functions across the entire system.

## Key Exports

| Function                    | Purpose |
|-----------------------------|---------|
| `executeWithRetry`          | Database operations with automatic retry |
| `enqueueMessage`            | Send messages to SQS |
| `getS3Client`               | Configured S3 client |
| `logger`                    | Centralized structured logging |
| `normalizePhone` / `isValidPhone` | Phone handling |
| `generatePin`               | Generate 6-digit OTPs |
| `capturePostHogEvent`       | Analytics tracking |

## Important Patterns
- Always prefer `executeWithRetry` for database calls
- Use `enqueueMessage` for background work
- Pass the shared DB pool instead of creating new connections

## Notes
This is one of the most widely used modules. Changes here affect many functions.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*