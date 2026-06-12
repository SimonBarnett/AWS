# API Layer

## Overview

The `API/` folder contains the main HTTP-facing Lambda function(s) that power the Club Madeira platform's public and internal APIs.

It is the primary entry point for all browser/widget requests and handles authentication, business logic, and data access.

## Purpose

- Expose RESTful endpoints via API Gateway
- Handle authentication and token-based flows
- Provide UI data endpoints (metrics, charts, settings)
- Orchestrate complex business processes (onboarding, delegation, ClubScan triggering)
- Enforce authorization and input validation

## Folder Structure

```
API/
├── index.js                 # Main Lambda handler / router
├── routes/
│   ├── token/               # Authentication & user lifecycle routes
│   │   ├── onboarding.js
│   │   ├── delegate.js
│   │   ├── delete.js
│   │   ├── reset-password.js
│   │   ├── addRole.js
│   │   └── tos.js
│   └── ui/                  # UI / dashboard data routes
│       ├── metrics.js
│       ├── chartData.js
│       ├── apiKeys.js
│       └── ...
├── helpers.js               # Shared helper functions for routes
└── config.js (legacy)       # Old configuration (being phased out)
```

## Key Subfolders

### `routes/token/`
Contains all authentication and user lifecycle flows.

**Main responsibilities:**
- User onboarding (generate/validate/complete tokens)
- Delegation of control between users
- Account deletion flows
- Password reset
- Role/permission management
- Terms of Service delivery

See `API/routes/token/README.md` for detailed documentation.

### `routes/ui/`
Contains endpoints that power the internal dashboard and UI components.

**Main responsibilities:**
- Metrics and reporting data
- Chart data generation
- API key management
- Other UI-specific data needs

See `API/routes/ui/README.md` for detailed documentation.

## Technical Patterns

- All routes receive a shared database connection pool (`pool`) and `sandbox` flag from the main router.
- Heavy use of `executeWithRetry` for resilient database operations.
- Email sending is performed asynchronously via SQS (`enqueueMessage` + `SEND_EMAIL` type).
- OTPs and temporary tokens are now centralized in the `SystemOTPs` table.

## Related Components

- **SystemOTPs** (RDS): Centralized storage for all OTPs and temporary tokens
- **SQS Catalogue Processor**: Handles background work triggered from API routes
- **Lambda Layers (`nodejs/`)**: Provides shared helpers, mailer, JWT, and configuration

## Notes

- The `API/` layer is designed to stay fast and lightweight. Long-running or external work is offloaded to SQS or standalone Lambdas.
- Legacy configuration in `config.js` is being replaced by SSM-based configuration in the Layers.

---

*Part of the hierarchical documentation on the `feature/documentation` branch.*