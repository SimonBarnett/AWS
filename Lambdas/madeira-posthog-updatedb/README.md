# PostHog Event Ingestion Lambda (`madeira-posthog-updatedb`)

**Purpose:**  
This Lambda pulls events from PostHog and stores them in the local database (`PostHogEvents` table). 

The original goal was to maintain an **off-site audit log** of activity that could later be used to identify bad actors, fraud patterns, or suspicious behaviour across the platform.

> **Note:** This feature is currently in a "keep it running, improve later" state. The core ingestion works, but deeper analysis / bad actor detection has not been built yet.

---

## Current Architecture (Post-Refactor)

This Lambda has been modernised to follow the shared layer patterns:

- Uses `logger`, `sql`, and `getDbConnection()` from `/opt/nodejs/helpers`
- No direct dependencies on `mssql`, `axios`, or `winston`
- Uses native `fetch` for PostHog API calls
- Follows the same patterns as `madeira-awin-clubscan` and other modernised Lambdas

---

## What It Does

1. Determines the last successful run time (from `LASTS` table or `PostHogEvents`).
2. Fetches all new events from PostHog since that time (with pagination).
3. Filters events that have a `source` property.
4. Enriches events with `referrer` data from the `Users` table (for both source and destination).
5. Performs a bulk insert into the `PostHogEvents` table.
6. Updates the `LASTS` table with the current timestamp.

This gives you a local, queryable copy of PostHog events with some extra context (referrers).

---

## Configuration (Environment Variables)

| Variable                | Required | Description                              | Example                     |
|-------------------------|----------|------------------------------------------|-----------------------------|
| `POSTHOG_HOST`          | No       | PostHog API host                         | `https://app.posthog.com`   |
| `POSTHOG_PROJECT_ID`    | Yes      | Your PostHog project ID                  | -                           |
| `POSTHOG_API_KEY`       | Yes      | PostHog Personal API Key (Bearer token)  | `phx_...`                   |

---

## Database Tables Used

- `PostHogEvents` — Main event storage
- `Users` — Used to look up `referrer` for source/destination user IDs
- `LASTS` — Tracks the last successful run time for incremental syncs

---

## Triggering

This Lambda is triggered on a schedule via **Amazon EventBridge Scheduler**.

It is designed to run regularly (typically every few hours or daily, depending on volume).

---

## Current Limitations & Future Intent

**Current state:**
- Reliable ingestion of PostHog events
- Basic referrer enrichment
- Off-site copy of activity

**Original vision (not yet implemented):**
- Use this data to detect bad actors, abuse patterns, or suspicious referral behaviour
- Build reporting / alerting on top of the `PostHogEvents` table
- Cross-reference with other systems for fraud signals

This is acknowledged as future work. The immediate priority was getting the ingestion stable and layer-compliant.

---

## Operational Notes

- Monitor CloudWatch Logs for PostHog API errors (especially rate limiting or auth issues).
- The `LASTS` table controls incremental behaviour — do not manually mess with it unless you know what you're doing.
- If the Lambda falls behind significantly, you can temporarily adjust the `lastRun` logic or clear old `LASTS` entries (with care).
- This Lambda is intentionally kept relatively lightweight after the refactor.

---

## File Location

```
Lambdas/madeira-posthog-updatedb/index.js
Lambdas/madeira-posthog-updatedb/package.json
Lambdas/madeira-posthog-updatedb/README.md
```

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett  
**Status:** Stable ingestion, future analysis features pending