# madeira-awin-clubscan Lambda

**Purpose**: Central orchestrator and processor for all AWIN-related automation for Club Madeira.

Handles:
- Daily global merchant recommendations
- Club-specific personalised join recommendations
- New advertiser onboarding + user creation
- Merchant catalogue sync from AWIN
- Transaction/payment ingestion (last 365 days)

---

## Architecture Overview

- **Runtime**: Node.js 20 (AWS Lambda)
- **Main entry**: `index.js` (orchestrator)
- **Routes**: `/routes/` (each exported as a handler or `.run()`)
- **Shared Layer**: `/opt/nodejs/helpers` + dedicated layers (`grok`, `auth-utils`, etc.)
- **Awin Config**: Pulled from SSM via `getAwinConfig()` (layer)
- **Grok**: Separate layer mounted at `/opt/nodejs/grok`
- **Database**: Connection managed via shared layer (`getDbConnection`)

All routes accept an optional `{ pool }` context so the orchestrator can reuse a single DB connection.

---

## Environment Variables (as of June 2026)

| Variable                        | Default / Example          | Now Sourced From          | Used By                     |
|--------------------------------|----------------------------|---------------------------|-----------------------------|
| `AWIN_ACCESS_TOKEN`            | `...`                      | SSM + `getAwinConfig()`   | All routes                  |
| `AWIN_PUBLISHER_ID`            | `2889699`                  | SSM + `getAwinConfig()`   | All routes                  |
| `GLOBAL_COOLDOWN_DAYS`         | `90`                       | Env / SSM                 | global                      |
| `GLOBAL_MAX_RECOMMENDATIONS`   | `20`                       | Env                       | global                      |
| `MIN_RELEVANCE_SCORE`          | `0.5`                      | Env                       | club                        |
| `NOTIFICATION_EMAIL_TO`        | `stakeholder@clubmadeira.uk` | Env / event override    | All                         |
| `LOG_LEVEL`                    | `debug`                    | Env                       | All                         |

> Any value passed in the event (`notificationEmailTo`, `maxRecommendations`, etc.) overrides the environment variable.

---

## Test Events (copy-paste ready)

### 1. Club-specific recommendation
```json
{
  "clubId": "NYFDPE6M",
  "partnerId": "2889699",
  "minRelevanceScore": 0.5,
  "notificationEmailTo": "si@ntsa.uk"
}
```

### 2. Global daily recommendations
```json
{
  "maxRecommendations": 12,
  "notificationEmailTo": ["si@ntsa.uk", "john@clubmadeira.uk"]
}
```

### 3. Full onboarding run (with sandbox test data)
```json
{
  "onboarding": true,
  "sandbox": true
}
```

### 4. Payments / transaction sync (last 365 days)
```json
{
  "route": "awin-payments"
}
```

### 5. Merchant catalogue sync only
```json
{
  "route": "sync-merchants"
}
```

---

## Sandbox Mode

Any payload that contains `"sandbox": true` activates test mode:

- Onboarding route:
  - Skips real AWIN API calls
  - Picks 8 random joined merchants
  - Generates 12 fake sales in the last 24h
  - Sends email to `si@ntsa.uk` with `[SANDBOX TEST]` prefix
- Global / Club routes still send real emails but can be filtered downstream if needed

**Purpose**: Safe end-to-end testing without touching production data or real AWIN quota.

---

## Route-by-Route Documentation

### `index.js` – Orchestrator
Routes the event to the correct handler and reuses a single DB pool.

Supported top-level keys:
- `route`: `"sync-merchants"` | `"awin-payments"`
- `clubId`: → club mode
- `onboarding`: `true` → full onboarding pipeline (sync → payments → onboard)
- Default → global recommendations

---

### `routes/global.js` – Daily Global Recommendations
**Trigger**: default / no special key

Flow:
1. Fetch high-approval, non-joined merchants
2. Call Grok for personalised `whyItFits` + join message
3. Record cooldown in `AwinRecommendedMerchants`
4. Build rich HTML email (table + join buttons)
5. Send via `invokeMailer` (supports array of emails)

---

### `routes/club.js` – Club-Specific Personalised Recommendations
**Trigger**: contains `clubId`

Flow:
- Pull club description from `clubscan` table
- Grok selects relevant sectors
- Fetch candidate merchants
- Grok scores relevance in batches of 80 (`relevanceScore`)
- Filter by `minRelevanceScore`
- Optional: update `PartnerID`
- Record in DB + rich HTML email

---

### `routes/onboarding.js` – New Advertiser Onboarding + Daily Report
**Trigger**: `onboarding: true`

Does:
- Sync joined programmes (or sandbox)
- Create user + hashed password for each new advertiser
- Generate 12 fake sales in sandbox mode
- Pull stats + last-24h sales + top-10 merchants
- Sends beautiful daily report email (always)

---

### `routes/sync-merchants.js`
**Trigger**: `route: "sync-merchants"`

One-shot full sync of all joined AWIN merchants into `AwinHighApprovalMerchants` using a big `MERGE`.

---

### `routes/awin-payments.js`
**Trigger**: `route: "awin-payments"`

Batched (20 merchants at a time) ingestion of last 365 days of transactions.  
Robust `clickRef` → `ClubID` parsing + idempotent `MERGE`.

---

## How to Call from Another Lambda / EventBridge

```json
{
  "route": "awin-payments"
}
```

or

```json
{
  "onboarding": true,
  "sandbox": true
}
```

Just invoke the Lambda with any of the test payloads above.

---

**Documentation complete.**  
You now have a single source of truth that is up-to-date with the final architecture, SSM config, sandbox behaviour, and all supported triggers.

Would you like me to also generate:
- A short `ARCHITECTURE.md` with diagrams (text + mermaid)
- Or a deployment checklist?

Just say the word.