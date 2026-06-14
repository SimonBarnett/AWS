# Amazon Card Claim Route (`/API/routes/amazoncard`)

**Purpose:**  
This route handles **voucher claiming** for the Club Madeira Amazon Affiliate browser extension.

It is called exclusively by the Chrome and Safari extensions when a user clicks the "Claim my voucher" button while browsing Amazon.co.uk.

> **Note:** Top-up / incentive logic has been moved to a separate Lambda (`lambdas/amazoncard-topup`).

---

## Overview

| Aspect                    | Details |
|---------------------------|---------|
| **Route**                 | `/amazoncard` |
| **HTTP Method**           | `POST` |
| **Authentication**        | None (public – called from browser extension) |
| **Primary Consumer**      | Club Madeira Browser Extension (Chrome + Safari) |
| **Core Logic**            | Calls stored procedure `sp_ClaimVoucher` |
| **Response**              | Dynamic based on stored procedure output (`success`, `httpStatus`, `value`, `redeem_url`, etc.) |

---

## How the Extension Calls This Route

The Chrome extension (`Extension/chrome/content.js`) does the following:

```js
const API_URL = 'https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/amazoncard';

const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
});

const data = await response.json();
```

**Key observations from the extension:**
- It sends **no request body**.
- It does **not** send any fingerprint or user identifier.
- It expects the following fields in the response:
  - `success` / `httpStatus`
  - `value` (voucher amount)
  - `redeem_url` (link to redeem the voucher)
  - `reason` (on failure)

---

## Backend Behavior

When called, the route:

1. Extracts `ip_address`, `user_agent`, and `fingerprint` (from headers or body — currently body is usually empty).
2. Calls the stored procedure:
   ```sql
   EXEC sp_ClaimVoucher 
       @ip_address = ?, 
       @user_agent = ?, 
       @fingerprint = ?
   ```
3. Returns whatever the stored procedure outputs, including:
   - `success`
   - `httpStatus`
   - `value`
   - `redeem_url`
   - `reason`

The stored procedure contains the actual business logic (cooldowns, voucher availability, fraud detection, etc.).

---

## Request Format

### POST `/amazoncard`

**Headers (recommended):**
```http
Content-Type: application/json
X-Fingerprint: <optional browser fingerprint>
```

**Body:** (currently ignored by the extension, but supported)
```json
{
  "fingerprint": "optional-browser-fingerprint"
}
```

---

## Response Format

The response structure is determined entirely by `sp_ClaimVoucher`.

### Success Example
```json
{
  "success": true,
  "httpStatus": 200,
  "value": 5.00,
  "redeem_url": "https://www.amazon.co.uk/gp/...",
  "operation": "claim"
}
```

### Failure Examples
```json
{
  "success": false,
  "httpStatus": 400,
  "reason": "You are on cooldown. Come back tomorrow.",
  "operation": "claim"
}
```

```json
{
  "success": false,
  "httpStatus": 404,
  "reason": "No vouchers available right now.",
  "operation": "claim"
}
```

---

## Security & Design Notes

- This is a **public endpoint** (no JWT) because it is called from a browser extension.
- Rate limiting / cooldown logic lives inside `sp_ClaimVoucher`.
- Fingerprint + IP + User-Agent are passed to the stored procedure for basic abuse detection.
- The route itself is intentionally thin — all business logic is in the database stored procedure.

---

## File Location

```
API/routes/amazoncard/index.js
```

---

## Related Components

| Component                        | Location                          | Role |
|----------------------------------|-----------------------------------|------|
| Chrome Extension                 | `Extension/chrome/`               | Injects claim button on Amazon |
| Safari Extension                 | `Extension/safari/` (if exists)   | Same functionality |
| Stored Procedure                 | Database (`sp_ClaimVoucher`)      | Core claim logic + fraud checks |
| Top-up Lambda                    | `lambdas/amazoncard-topup/`       | Separate incentive top-up flow |

---

## Maintenance Notes

- Do **not** add authentication to this route.
- If you need to change the request/response contract, coordinate with the browser extension team.
- Monitor CloudWatch for high error rates from this endpoint (can indicate issues with `sp_ClaimVoucher`).

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Called by:** Club Madeira Browser Extension (Chrome/Safari)