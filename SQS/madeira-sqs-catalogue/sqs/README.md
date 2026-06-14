# Madeira SQS Catalogue Pipeline – SQS Handlers

This document provides full documentation for the SQS message handlers in `madeira-sqs-catalogue/sqs/`.

It covers message types, their relation to the Token API and frontend widgets, email functions, the onboarding flow, and how users update their catalogue.

## Message Types

The main orchestrator (`index.js`) routes the following SQS message types:

| Message Type                    | Handler File              | Triggered From                          | Description |
|---------------------------------|---------------------------|-----------------------------------------|-------------|
| `ONBOARDING`                    | `onboarding.js`           | `/API/routes/token/onboarding`          | Initial onboarding of a new club/partner site |
| `CATEGORY_UPDATE`               | `process-update.js`       | Category widget / User prompt           | User updates their discount categories via chat or form |
| `CLUBSCAN_GENERATE_REVIEW`      | `generate-review.js`      | Onboarding or manual trigger            | Generates AI review/summary for the club site |
| `CLUBSCAN_GENERATE_CATEGORIES`  | `generate-categories.js`  | After review or category update         | Uses Grok to suggest initial categories |
| `CLUBSCAN_BUILD_CATALOG`        | `build-catalog.js`        | After categories are ready              | Builds the final searchable catalogue from UserCategories |
| `CLUBSCAN_NOTIFY`               | `notify.js`               | End of successful build                 | Sends success/failure emails to the partner |
| `SEND_EMAIL`                    | `emails.js` (parent)      | Various places (onboarding, notify)     | Generic email sending via SQS |

## Example SQS Test Events

These are example payloads you can use for manual testing via the AWS Console or CLI.

### Onboarding a New Site

```json
{
  "Records": [
    {
      "body": "{\"type\":\"ONBOARDING\",\"userId\":\"OKKCFJOQ\",\"url\":\"https://www.toddlerandbaby.club\",\"partnerId\":\"L7WDZWC8\",\"sandbox\":true}"
    }
  ]
}
```

### Generate AI Review

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_GENERATE_REVIEW\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### Generate Categories

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_GENERATE_CATEGORIES\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### Build Final Catalogue

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_BUILD_CATALOG\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### Send Notification

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_NOTIFY\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### User Updates Categories (via widget)

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CATEGORY_UPDATE\",\"userId\":\"OKKCFJOQ\",\"body\":{\"prompt\":\"Add a baby monitors category.\"},\"sandbox\":true}"
    }
  ]
}
```

## Relation to `/API/routes/token`

- **`ONBOARDING`** is triggered from the token onboarding routes after a user completes signup and agrees to terms.
- The token layer creates the initial `clubscan` record and enqueues `ONBOARDING`.
- `CATEGORY_UPDATE` can be triggered from authenticated token routes when a user manages their categories.

## Relation to `/s3-bucket/` Widgets

Several widgets in `s3-bucket/` interact with this pipeline:

- **category-widget.js**: Allows users to chat/update categories → triggers `CATEGORY_UPDATE` via the API.
- **signup-widget.js** / partner flows: Trigger `ONBOARDING`.
- Dashboard widgets may show catalogue build status.

The widgets call the API, which enqueues the appropriate SQS message.

## Email Functions (Full Documentation)

Email sending is centralized in two places:

### 1. `emails.js` (Parent Level)

Generic email sender. Handles `SEND_EMAIL` messages.

Common email types sent via this system:
- Onboarding success / failure
- Delegation emails
- Merchant report emails
- Partner onboarding notifications

### 2. `notify.js` (in `sqs/`)

Specialized notifier used at the end of the catalogue build pipeline.

**Key functions**:
- `sendSuccessEmail(toEmails, clubId, url)`
  - Sends the widget code + success message to the partner.
  - Includes the Madeira widget embed code.
- `sendFailureEmail(toEmails, url, errorMessage)`
  - Sends failure notification when catalogue build fails.

`notify.js` is usually triggered by `CLUBSCAN_NOTIFY` after `build-catalog.js` completes.

## Onboarding Flow (Full Documentation)

**File:** `onboarding.js`

**Triggered by:** `ONBOARDING` message from token routes.

**Steps:**
1. Creates/updates record in `clubscan` table with `Status = 'queued'`.
2. Uses `withStatusHandling` helper to track progress (`onboarding` → `onboarding_complete`).
3. If **not sandbox** → enqueues `CLUBSCAN_GENERATE_REVIEW`.
4. In sandbox mode, it stops after creating the record (no further processing).

This is the entry point that kicks off the entire AI-powered catalogue generation for a new site.

## How Users Update the Catalogue

**File:** `process-update.js` (handles `CATEGORY_UPDATE`)

This is the main path when a logged-in user updates their categories.

**Flow:**
1. User interacts with **category-widget.js** (in s3-bucket) or dashboard.
2. Widget calls API → API enqueues `CATEGORY_UPDATE` with `userId` and `body` (prompt + exclusions).
3. `process-update.js`:
   - Fetches current categories from `UserCategories`.
   - Appends the new prompt to chat history.
   - Calls Grok with `CATEGORY_SCHEMA` to generate/update categories.
   - Saves updated `json_categories`, `json_exclude`, and `json_chat`.
   - Enqueues `CLUBSCAN_BUILD_CATALOG` (with `enqueueNotify: false`).

After this, the pipeline continues with:
- `generate-categories.js` (if needed)
- `build-catalog.js`
- `notify.js` (optional)

This allows users to iteratively refine their catalogue via natural language.

## Full Pipeline Summary (User Perspective)

**New Site Onboarding:**
`Token Onboarding` → `ONBOARDING` → `CLUBSCAN_GENERATE_REVIEW` → `CLUBSCAN_GENERATE_CATEGORIES` → `CLUBSCAN_BUILD_CATALOG` → `CLUBSCAN_NOTIFY` (email)

**User Updates Catalogue:**
`Category Widget` → `CATEGORY_UPDATE` → Grok category generation → `CLUBSCAN_BUILD_CATALOG` → (optional notify)

## Helpers

`helpers.js` contains shared utilities like `withStatusHandling` and `updateStatus` used across multiple handlers to keep status tracking consistent in `clubscan`.

---

**Last updated:** 14 June 2026