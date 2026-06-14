# Route-by-Route Documentation

**Detailed documentation for each route/handler in the madeira-awin-clubscan Lambda.**

See the [top-level README](../README.md) for architecture overview, environment variables, EventBridge Scheduler setup, test events, and sandbox mode.

---

## `index.js` – Orchestrator

**Role**: Inspects the incoming event and routes to the correct handler. Reuses a single database connection pool for efficiency.

### Accepted Parameters (top-level event)

| Parameter          | Type              | Required | Description                                                                 | Example / Notes                          |
|--------------------|-------------------|----------|-----------------------------------------------------------------------------|------------------------------------------|
| `route`            | string            | No       | Direct route trigger                                                        | `"sync-merchants"` or `"awin-payments"` |
| `clubId`           | string            | No       | Triggers club-specific recommendations                                      | `"NYFDPE6M"`                            |
| `onboarding`       | boolean           | No       | Triggers full onboarding + daily report pipeline                            | `true`                                   |
| `sandbox`          | boolean           | No       | Enables sandbox/test mode (fake data + test email routing)                  | `true`                                   |
| `maxRecommendations` | number          | No       | Passed to global mode                                                       | `12`                                     |
| `notificationEmailTo` | string \| array | No       | Override email recipient(s)                                                 | `"si@ntsa.uk"` or array                |
| `partnerId`        | string            | No       | Passed to club mode for tagging                                             | `"2889699"`                             |
| `minRelevanceScore`| number            | No       | Passed to club mode                                                         | `0.6`                                    |

**Default behaviour** (no special keys): Runs global recommendations.

---

## `routes/global.js` – Daily Global Recommendations

**Trigger**: No `clubId`, no `onboarding`, no `route` (or default path in orchestrator).

**Purpose**: Daily run that recommends high-approval AWIN merchants to join.

### Accepted Parameters

| Parameter             | Type              | Required | Description                                      | Default                  |
|-----------------------|-------------------|----------|--------------------------------------------------|--------------------------|
| `maxRecommendations`  | number            | No       | Maximum number of merchants to recommend         | `20` (from env)          |
| `notificationEmailTo` | string or array   | No       | Email address(es) to send the report to          | From env var             |

**Flow:**
1. Query high-approval merchants not recently recommended.
2. Call Grok for personalised `whyItFits` + join message.
3. Record in `AwinRecommendedMerchants` (cooldown tracking).
4. Generate rich HTML email with join buttons.
5. Send via mailer.

---

## `routes/club.js` – Club-Specific Personalised Recommendations

**Trigger**: Event contains `clubId`.

**Purpose**: Generate highly relevant merchant recommendations tailored to a specific club.

> **Business Context**: This route is called when a new community/club onboards. The partner receives a ready-to-use list of AWIN advertisers they can apply to **on behalf of the club**. Successful onboarding of the supplier earns the partner an **extra %** on all future transactions from that advertiser.

### Accepted Parameters

| Parameter             | Type              | Required | Description                                                                 | Default / Notes                     |
|-----------------------|-------------------|----------|-----------------------------------------------------------------------------|-------------------------------------|
| `clubId`              | string            | **Yes**  | The ClubID from `clubscan` table                                            | e.g. `"NYFDPE6M"`                  |
| `partnerId`           | string            | No       | If provided, updates `PartnerID` on recommended merchants                   | Optional tagging                    |
| `minRelevanceScore`   | number (0–1)      | No       | Minimum Grok relevance score to include a merchant                          | `0.5` (from env)                    |
| `notificationEmailTo` | string or array   | No       | Override recipient(s) for the recommendation email                          | From env var                        |

**Flow:**
- Fetch club description from `clubscan`.
- Grok selects relevant sectors.
- Fetch candidates → batch Grok relevance scoring (batches of 80).
- Filter by `minRelevanceScore`.
- Optional `PartnerID` update.
- Record recommendations + send rich HTML email.

---

## `routes/onboarding.js` – New Advertiser Onboarding + Daily Report

**Trigger**: `onboarding: true`

**Purpose**: Onboard new joined AWIN advertisers (create users) + send daily operational report.

### Accepted Parameters

| Parameter  | Type    | Required | Description                                      | Notes                                      |
|------------|---------|----------|--------------------------------------------------|--------------------------------------------|
| `onboarding` | boolean | **Yes**  | Must be `true` to trigger this route             | -                                          |
| `sandbox`  | boolean | No       | Generate fake sales data and route email to test address | `true` → uses `si@ntsa.uk`              |

**Behaviour:**
- If `sandbox: true`: Picks random merchants + inserts 12 fake sales.
- Always generates and sends a rich daily report email (stats, last 24h sales, top merchants, new onboardings).

---

## `routes/sync-merchants.js`

**Trigger**: `route: "sync-merchants"`

**Purpose**: Full sync of joined AWIN merchants into the local `AwinHighApprovalMerchants` table.

### Accepted Parameters

_No special parameters required._ The handler runs a complete sync when triggered.

**Trigger example:**
```json
{ "route": "sync-merchants" }
```

---

## `routes/awin-payments.js`

**Trigger**: `route: "awin-payments"`

**Purpose**: Ingest last 365 days of AWIN transactions in batches (20 merchants at a time).

### Accepted Parameters

_No special parameters required._

**Trigger example:**
```json
{ "route": "awin-payments" }
```

Uses robust `clickRef` parsing to determine `ClubID` and performs idempotent `MERGE`.

---

## How to Call

### From EventBridge Scheduler
Create a schedule that sends one of the JSON payloads below as the event.

### From another Lambda / manual invoke
```json
{
  "onboarding": true,
  "sandbox": true
}
```

or

```json
{
  "clubId": "NYFDPE6M",
  "partnerId": "2889699",
  "minRelevanceScore": 0.6
}
```

or direct routes:

```json
{ "route": "awin-payments" }
```