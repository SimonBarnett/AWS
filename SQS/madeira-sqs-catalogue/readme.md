# Madeira SQS Catalogue Pipeline

`madeira-sqs-catalogue` is the central Lambda responsible for the **AI-powered catalogue generation and maintenance** for clubs and partners.

It handles onboarding new sites, generating reviews and categories using Grok, building the final searchable catalogue, and notifying stakeholders.

## Purpose

- Onboard new club/partner websites asynchronously
- Generate AI reviews and suggested categories using xAI Grok
- Build and maintain the live product catalogue from user-defined categories
- Allow users to iteratively update their catalogue via natural language
- Send notifications on success or failure

## Environment Variables

| Variable          | Example Value                              | Description |
|-------------------|--------------------------------------------|-------------|
| `NOTIFY`          | stakeholder@madeira.uk                     | Default email address for production notifications |
| `SANDBOX_NOTIFY`  | si@ntsa.uk                                 | Email address used for notifications when `sandbox: true` |
| `SQS_QUEUE_URL`   | https://sqs.eu-west-2.amazonaws.com/620257466932/madeira-category-queue | Target SQS queue for internal messages |

Other common variables used across handlers include logging level and Grok-related configuration (inherited from layers).

## Sandbox Mode

The `sandbox` flag is passed in almost every message and is used extensively throughout the pipeline.

**When `sandbox: true`:**
- Email notifications are sent to `SANDBOX_NOTIFY` instead of `NOTIFY`
- Certain heavy operations (like full Grok review generation) may be skipped or limited
- Status updates in `clubscan` still occur so progress can be tracked
- Useful for testing new onboarding flows or Grok prompts without spamming real stakeholders

The flag originates from the initial trigger (Token API or scheduler) and is propagated through all downstream messages (`ONBOARDING` → `CLUBSCAN_GENERATE_REVIEW` → etc.).

## Message Types & Pipeline Overview

The main message types handled are:

- `ONBOARDING`
- `CATEGORY_UPDATE`
- `CLUBSCAN_GENERATE_REVIEW`
- `CLUBSCAN_GENERATE_CATEGORIES`
- `CLUBSCAN_BUILD_CATALOG`
- `CLUBSCAN_NOTIFY`
- `SEND_EMAIL`

**Full details** (including handler logic and flow): See [sqs/readme.md](./sqs/readme.md)

## Test Invocation Scripts

### 1. Onboarding a New Site

```json
{
  "Records": [
    {
      "body": "{\"type\":\"ONBOARDING\",\"userId\":\"OKKCFJOQ\",\"url\":\"https://www.toddlerandbaby.club\",\"partnerId\":\"L7WDZWC8\",\"sandbox\":true}"
    }
  ]
}
```

### 2. Generate AI Review

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_GENERATE_REVIEW\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### 3. Generate Categories

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_GENERATE_CATEGORIES\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### 4. Build Final Catalogue

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_BUILD_CATALOG\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### 5. Send Notification

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CLUBSCAN_NOTIFY\",\"url\":\"https://www.toddlerandbaby.club/\",\"sandbox\":true}"
    }
  ]
}
```

### 6. User Updates Categories (via widget)

```json
{
  "Records": [
    {
      "body": "{\"type\":\"CATEGORY_UPDATE\",\"userId\":\"OKKCFJOQ\",\"body\":{\"prompt\":\"Add a baby monitors category.\"},\"sandbox\":true}"
    }
  ]
}
```

## Onboarding Flow

**Entry point:** `sqs/onboarding.js` (triggered by `ONBOARDING` message from Token routes)

**High-level steps:**
1. Creates or updates the `clubscan` record with status `queued`.
2. Uses status tracking helpers to mark progress (`onboarding` → `onboarding_complete`).
3. If **not in sandbox**, enqueues `CLUBSCAN_GENERATE_REVIEW` to start the AI review generation.
4. In sandbox mode, processing stops after record creation.

This is the starting point for all new club/partner sites.

## Category Creation & User Updates

Users can update their catalogue in two main ways:

### 1. Automatic (during onboarding)
After `ONBOARDING`, the pipeline automatically runs:
- `CLUBSCAN_GENERATE_REVIEW` → generates an AI summary of the site
- `CLUBSCAN_GENERATE_CATEGORIES` → suggests initial discount categories using Grok
- `CLUBSCAN_BUILD_CATALOG` → builds the final searchable product list

### 2. Manual / Iterative Updates (by user)
Users interact with the **category-widget** in the partner dashboard. This triggers a `CATEGORY_UPDATE` message containing a natural language prompt.

`process-update.js` then:
- Loads current categories + chat history from `UserCategories`
- Calls Grok with the new prompt
- Saves updated categories and exclusions
- Enqueues `CLUBSCAN_BUILD_CATALOG` to regenerate the live catalogue

This allows ongoing refinement without full re-onboarding.

## Related Documentation

- [SQS Message Handlers (detailed)](./sqs/readme.md) — Message types, handlers, email logic, and full flows

---

**Last updated:** 14 June 2026