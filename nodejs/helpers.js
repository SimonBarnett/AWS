# helpers.js (Core Shared Helpers)

## Overview
Main shared utility module in the Lambda Layer.

## Key Functions

| Function                    | Purpose                                      |
|-----------------------------|----------------------------------------------|
| `executeWithRetry`          | Database calls with automatic retry          |
| `enqueueMessage`            | Send messages to SQS                         |
| `getS3Client`               | Returns configured S3 client                 |
| `logger`                    | Centralized structured logging               |
| `normalizePhone`            | Standardizes phone numbers                   |
| `generatePin`               | Generates 6-digit OTP/PIN                    |
| `capturePostHogEvent`       | Sends analytics events                       |

## Best Practices
- Always use `executeWithRetry` for DB operations
- Pass the shared pool instead of creating new connections
- Use `enqueueMessage` for all background work

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*