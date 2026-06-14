# Amazon Card Top-up Lambda (`lambdas/amazoncard-topup`)

**Purpose:**  
This Lambda is responsible for **generating and topping up** Amazon Gift Cards that are later claimed by users through the Club Madeira browser extension.

It runs on a weekly schedule and uses Amazon’s AGCOD v2 API to create real gift cards, which are then stored in the database for later claiming.

> **Important:** This is the **supply side**. The **demand/claiming side** lives in `API/routes/amazoncard/`.

---

## Business Context

Club Madeira partners with Amazon to offer gift card incentives/vouchers to users of the browser extension.

- The **top-up Lambda** creates new gift cards in bulk (via AGCOD).
- These cards are stored in the `amazon_cards` table with status `available`.
- When a user clicks “Claim my voucher” in the extension, the `API/routes/amazoncard` route calls `sp_ClaimVoucher`, which allocates one of these pre-generated cards.

This separation keeps the sensitive AGCOD creation process isolated and scheduled, while the claiming process remains fast and on-demand.

---

## Triggering

This Lambda is triggered by **Amazon EventBridge Scheduler**.

Current schedule: `AmazonCard-Topup` (currently disabled in some environments).

It is designed to run **once per week**.

---

## Configuration

### From Incentive Config Layer (`getIncentiveConfig`)

| Parameter                    | Source          | Description                                      | Example          |
|-----------------------------|-----------------|--------------------------------------------------|------------------|
| `AMAZON_PARTNER_ID`         | SSM / Layer     | Amazon AGCOD Partner ID                          | -                |
| `AMAZON_ACCESS_KEY_ID`      | SSM / Layer     | Access key for AGCOD signing                     | -                |
| `AMAZON_SECRET_ACCESS_KEY`  | SSM / Layer     | Secret key for AGCOD signing                     | -                |
| `AMAZON_BRAND`              | SSM / Layer     | Brand name shown on gift cards                   | `Club Madeira`   |
| `AMAZON_CURRENCY`           | SSM / Layer     | Currency code                                    | `GBP`            |
| `AMAZON_SANDBOX`            | SSM / Layer     | Use sandbox endpoint                             | `true` / `false` |

### Environment Variable (intentionally not in SSM)

| Variable   | Description                                                                 | Reason for env var                     |
|------------|-----------------------------------------------------------------------------|----------------------------------------|
| `BUDGET`   | Total value of gift cards to generate in this run (in currency units)       | Can be changed without SSM access      |

---

## What This Lambda Does

1. Loads configuration from the shared incentive config layer.
2. Reads `BUDGET` from environment variable.
3. Generates a list of gift card denominations that add up to (or close to) the budget.
4. For each denomination:
   - Calls Amazon AGCOD `CreateGiftCard` API (signed with aws-sdk v2).
   - Stores the resulting `claimCode` and `gcId` in the `amazon_cards` table.
5. After all cards are created, runs a day-of-week cycling update so cards are distributed evenly across the week.

### Card Generation Logic

The current logic is intentionally simple and slightly randomised:

- 25% chance of adding a £10 card
- Always adds a £5 card
- 50% chance of adding another £5 card
- Fills the remainder with £1 and £2 cards

This produces a natural mix of card values while staying close to the target budget.

---

## Why aws-sdk v2 Is Still Used Here

This Lambda **intentionally** uses `aws-sdk` version 2 for signing AGCOD requests.

Reasons:

- AGCOD request signing is sensitive and has caused issues during previous migration attempts.
- This process only runs **once per week**, so performance is not a concern.
- The signing logic has been isolated to this single Lambda to avoid affecting the rest of the platform (which has moved to AWS SDK v3).

The `package.json` explicitly documents this decision.

---

## Database Interaction

### Table: `amazon_cards`

| Column          | Type           | Purpose                              |
|-----------------|----------------|--------------------------------------|
| `code`          | NVARCHAR(100)  | The claim code users redeem          |
| `value`         | DECIMAL(10,2)  | Face value of the card               |
| `currency`      | NVARCHAR(3)    | Currency code (e.g. GBP)             |
| `status`        | NVARCHAR(20)   | `available`, `claimed`, etc.         |
| `amazon_gc_id`  | NVARCHAR(100)  | Amazon’s internal gift card ID       |
| `day_of_week`   | INT            | 0–6, used for even distribution      |
| `created_at`    | DATETIME       | When the card was created            |
| `updated_at`    | DATETIME       | Last update time                     |

After insertion, a day-of-week cycling query is run to evenly distribute available cards across the 7 days of the week.

---

## Related Components

| Component                        | Location                              | Relationship                                      |
|----------------------------------|---------------------------------------|---------------------------------------------------|
| **Top-up Lambda**                | `Lambdas/amazoncard-topup/`           | Creates and stores gift cards                     |
| **Claim API Route**              | `API/routes/amazoncard/`              | Allows browser extension to claim a card          |
| **Browser Extension**            | `Extension/chrome/` + `Extension/safari/` | Calls the claim route when user clicks button    |
| **Stored Procedure**             | Database (`sp_ClaimVoucher`)          | Contains claiming + fraud/cooldown logic          |
| **Incentive Config Layer**       | `Layers/madeira-incentive-config/`    | Supplies Amazon credentials and settings          |

See also: `API/routes/amazoncard/readme.md` for full details on the claiming side.

---

## Error Handling & Logging

- All errors are logged via the shared `logger` from `/opt/nodejs/helpers`.
- Amazon API errors include the HTTP status and response body.
- The Lambda always returns a structured JSON response (`success`, `inserted`, `totalValue`, etc.).
- Database connection is properly closed in a `finally` block.

---

## Operational Notes

- This Lambda should normally remain **enabled** on a weekly schedule.
- The `AmazonCard-Topup` EventBridge schedule controls when it runs.
- Monitor CloudWatch Logs for AGCOD errors (these usually indicate credential or signing issues).
- The `BUDGET` environment variable can be adjusted without touching SSM.
- Sandbox mode (`AMAZON_SANDBOX=true`) is useful for testing without creating real gift cards.

---

## File Location

```
Lambdas/amazoncard-topup/index.js
Lambdas/amazoncard-topup/package.json
Lambdas/amazoncard-topup/README.md
```

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Runs:** Weekly via EventBridge Scheduler  
**Related:** `API/routes/amazoncard/` (claiming side)