# Token Routes

## Overview
Handles all authentication and user lifecycle flows.

## Main Files

| File | Purpose |
|------|---------|
| `onboarding.js` | Onboarding (generate, validate, complete) |
| `delegate.js` | Delegation flows |
| `delete.js` | Account deletion |
| `reset-password.js` | Password reset |
| `addRole.js` | Role/permission management |
| `tos.js` | Terms of Service delivery |

## Key Patterns
- Uses `SystemOTPs` table for all temporary tokens
- Email sending via SQS
- SMS for OTP delivery
- Shared DB pool from router

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*