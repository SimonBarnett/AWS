# API Layer

## Overview
Main HTTP-facing layer. Handles all requests coming through API Gateway.

## Structure

- `routes/token/` — Auth, onboarding, delegation, password reset, deletion
- `routes/ui/` — Dashboard data, metrics, charts, API keys
- `helpers.js` — API-specific helpers

## Key Patterns
- All routes receive `{ pool, sandbox }` from the main router
- No direct DB connections inside routes (use passed pool)
- Email sending goes through SQS (`enqueueMessage`)
- OTPs stored in `SystemOTPs` table

See subfolder READMEs for details.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*