# Route-by-Route Documentation

**Detailed documentation for each route/handler in the madeira-awin-clubscan Lambda.**

See the [top-level README](../README.md) for architecture overview, environment variables, test events, and sandbox mode.

---

## `index.js` – Orchestrator

Routes the event to the correct handler and reuses a single DB pool.

**Supported top-level keys:**
- `route`: `"sync-merchants"` | `"awin-payments"`
- `clubId`: → club mode
- `onboarding`: `true` → full onboarding pipeline (sync → payments → onboard)
- Default → global recommendations

---

## `routes/global.js` – Daily Global Recommendations

**Trigger**: default / no special key

**Flow:**
1. Fetch high-approval, non-joined merchants
2. Call Grok for personalised `whyItFits` + join message
3. Record cooldown in `AwinRecommendedMerchants`
4. Build rich HTML email (table + join buttons)
5. Send via `invokeMailer` (supports array of emails)

---

## `routes/club.js` – Club-Specific Personalised Recommendations

**Trigger**: contains `clubId`

**Flow:**
- Pull club description from `clubscan` table
- Grok selects relevant sectors
- Fetch candidate merchants
- Grok scores relevance in batches of 80 (`relevanceScore`)
- Filter by `minRelevanceScore`
- Optional: update `PartnerID`
- Record in DB + rich HTML email

---

## `routes/onboarding.js` – New Advertiser Onboarding + Daily Report

**Trigger**: `onboarding: true`

**Does:**
- Sync joined programmes (or sandbox)
- Create user + hashed password for each new advertiser
- Generate 12 fake sales in sandbox mode
- Pull stats + last-24h sales + top-10 merchants
- Sends beautiful daily report email (always)

---

## `routes/sync-merchants.js`

**Trigger**: `route: "sync-merchants"`

One-shot full sync of all joined AWIN merchants into `AwinHighApprovalMerchants` using a big `MERGE`.

---

## `routes/awin-payments.js`

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