# madeira-awin-clubscan Lambda

**Purpose**: Central orchestrator and processor for all AWIN-related automation for Club Madeira.

Handles daily global recommendations, club-specific personalised joins, new advertiser onboarding, merchant catalogue sync, and transaction ingestion.

---

## Quick Start / Setup

This Lambda is designed to be triggered via **Amazon EventBridge Scheduler**, another Lambda, or manually with test events.

### Triggering via Amazon EventBridge Scheduler

This Lambda is invoked on a schedule using **Amazon EventBridge Scheduler**.

Current schedules targeting `madeira-awin-clubscan` include:

- `Awin-Onboarding` — triggers full onboarding + daily report (often with `sandbox` for testing)
- `Awin-HighApproval` — triggers global or high-approval merchant recommendations

These schedules pass structured event payloads (e.g. `{ "onboarding": true }`, `{ "route": "..." }`, or club-specific parameters).

---

**Key dependencies** (provided via Layers):
- Shared helpers (`/opt/nodejs/helpers`)
- Grok/xAI client (`/opt/nodejs/grok`)
- Auth utilities (`/opt/nodejs/auth-utils`)
- Awin config from SSM (`getAwinConfig`)

**Environment Variables** (some now come from SSM via config layer):

| Variable                        | Notes                                      |
|--------------------------------|--------------------------------------------|
| `AWIN_ACCESS_TOKEN`            | From SSM via `getAwinConfig()`             |
| `AWIN_PUBLISHER_ID`            | From SSM via `getAwinConfig()` (2889699)   |
| `GLOBAL_COOLDOWN_DAYS`         | 90 (default)                               |
| `GLOBAL_MAX_RECOMMENDATIONS`   | 20 (default)                               |
| `MIN_RELEVANCE_SCORE`          | 0.5 (default)                              |
| `NOTIFICATION_EMAIL_TO`        | Can be overridden in event                 |
| `LOG_LEVEL`                    | debug / info                               |

---

## Core Concepts

- **Orchestrator pattern**: `index.js` inspects the event and routes to the appropriate handler, reusing a single DB connection pool.
- **Layer-first architecture**: Generic logic (DB, logging, Grok calls, mailer, hashing, config) lives in shared Layers. This Lambda only contains AWIN-specific orchestration and business logic.
- **Idempotent & safe**: Uses `MERGE` statements, cooldown tracking, and sandbox mode for safe testing.
- **Sandbox mode**: Pass `"sandbox": true` to generate test data and route emails to `si@ntsa.uk` (useful for end-to-end validation without hitting real AWIN quotas).

---

## Test Events

See full list and examples in the detailed documentation.

Common ones:
- Club mode: `{ "clubId": "NYFDPE6M", ... }`
- Global: `{ "maxRecommendations": 12 }`
- Onboarding + sandbox: `{ "onboarding": true, "sandbox": true }`
- Direct routes: `{ "route": "awin-payments" }` or `{ "route": "sync-merchants" }`

---

## Documentation Structure

- **This file**: High-level purpose, setup, core concepts, and quick reference.
- **[routes/README.md](routes/README.md)**: Detailed route-by-route documentation, triggers, accepted parameters, flows, and implementation notes for every handler.

---

**Full detailed route documentation lives in [routes/README.md](routes/README.md).**