# API Layer

## Overview
Main HTTP API layer.

## Structure
- `routes/token/` — Auth & user lifecycle
- `routes/ui/` — Dashboard data

## Key Patterns
- Shared DB pool passed from router
- Email via SQS
- OTPs in `SystemOTPs` table

See subfolder READMEs for details.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*