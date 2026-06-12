# Token Routes (`API/routes/token/`)

## Overview

This folder contains all authentication, user lifecycle, and security-related API routes.

It is one of the most critical parts of the system, handling user onboarding, delegation of control, account deletion, password resets, and role management.

## Purpose

- Manage temporary tokens and OTPs for secure user flows
- Handle user onboarding journey (invite → validate → complete)
- Support delegation of catalogue control between users
- Provide secure account deletion flow
- Manage password reset functionality
- Control user roles and permissions

## Contents

| File                        | Responsibility                                      | Key Actions                  |
|-----------------------------|-----------------------------------------------------|------------------------------|
| `index.js`                  | Main router for all token routes                    | Dispatches by path + action  |
| `onboarding.js`             | Full onboarding lifecycle                           | generate, validate, complete |
| `delegate.js`               | Delegation of control flows                         | initiate, accept             |
| `delete.js`                 | Account deletion with OTP verification              | initiate, confirm            |
| `reset-password.js`         | Password reset flow                                 | request, verify              |
| `addRole.js`                | Adding roles/permissions to users                   | (merchant role)              |
| `tos.js`                    | Serving Terms of Service                            | From S3 based on token type  |
| `emails.js` (removed)       | Previously handled email sending (now via SQS)      | -                            |

## Key Patterns

### SystemOTPs Table
All temporary tokens and OTPs are now stored in the centralized `SystemOTPs` table with a `token_type` discriminator and flexible `payload` JSON column.

### Email Handling
Email sending has been moved out of the API layer. Routes now call:
```js
await enqueueMessage({
    type: 'SEND_EMAIL',
    emailType: 'onboarding' | 'delegation' | ...,
    payload: { ... }
});
```

### SMS + OTP
PINs/OTPs are always delivered via SMS using TextMagic. Email is used as a secondary channel where appropriate.

## Important Flows

### Onboarding Flow
1. Admin/Partner calls `generate` → Creates record in `SystemOTPs` + sends email + SMS
2. User validates with PIN → `validate` action
3. User completes onboarding (Stripe + user creation) → `complete` action

### Delegation Flow
1. Owner initiates delegation → Creates OTP + sends email + SMS
2. New user accepts with OTP → Transfers control + sends confirmation email

## Related Components

- `SystemOTPs` (RDS table)
- SQS Catalogue Processor (for background email sending)
- Lambda Layers (`nodejs/helpers`, `nodejs/mailer`, `nodejs/sms`)

## Notes

- The old separate tables (`Tokens`, `delegation`, `deletion`, `Otps`) have been replaced by `SystemOTPs`.
- All routes receive `{ pool, sandbox }` from the main `index.js` router.
- Heavy use of `executeWithRetry` for database resilience.

---

*Part of the hierarchical documentation on the `feature/documentation` branch.*