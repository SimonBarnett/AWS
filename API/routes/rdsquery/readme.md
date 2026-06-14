# RDS Query Route (`/API/routes/rdsquery`)

**Purpose:**  
This route provides a **read-only, low-privilege** interface to the Madeira database. It is **specifically designed** to serve catalogue data to the public-facing `madeira-widget.js` embedded on partner/club websites.

It is one of the few truly **public** routes in the API (no JWT required).

---

## Overview

| Aspect                  | Details |
|-------------------------|---------|
| **Route Path**          | `/rds` or `/query` (proxied through main API orchestrator) |
| **Authentication**      | None (public) |
| **Database Access**     | Low-privilege SQL account (read-only intent) |
| **Primary Consumer**    | `madeira-widget.js` (catalogue display on external sites) |
| **Supported Queries**   | `dbo.Menu(...)` and `dbo.Part2(...)` only |
| **Logging**             | Every call is logged to `DatabaseCallLog` table |

---

## Environment Variables (API Gateway / Lambda)

This route **requires** the following environment variables to be set on the Lambda / API Gateway:

| Variable                  | Purpose                                      | Example Value                  | Sensitivity |
|---------------------------|----------------------------------------------|--------------------------------|-------------|
| `DB_LOW_PRIV_USER`        | Low-privilege database username              | `madeira_low_priv`             | High        |
| `DB_LOW_PRIV_PASSWORD`    | Low-privilege database password              | (stored in Parameter Store)    | **Secret**  |

These credentials should have **read-only** access to the necessary tables/functions (`Menu`, `Part2`, `DatabaseCallLog`, etc.).

> **Security Note:** Never use the main application database credentials here. This separation is intentional.

---

## How It Works

1. Receives a request containing a raw T-SQL query string.
2. Validates that the query matches one of two allowed patterns:
   - `dbo.Menu('UserId', 'Category'?)`
   - `dbo.Part2('UserId', 'MainCategory', 'SubCategory'?, ...)`
3. Extracts `UserId`, `Category`, and `SubCategory` for logging.
4. Connects to the database using the **low-privilege** credentials from environment variables.
5. Logs the call to `[dbo].[DatabaseCallLog]`.
6. Executes the original query.
7. Returns the `recordset` as JSON.

---

## Supported Query Patterns

### 1. Menu Query (Top-level categories)

```sql
SELECT * FROM dbo.Menu('L7WDZWC8', 'Electronics')
-- or
SELECT * FROM [dbo].[Menu]('L7WDZWC8', NULL)
```

### 2. Part2 Query (Paginated catalogue items)

```sql
SELECT * FROM dbo.Part2('L7WDZWC8', 'Electronics', 'Mobile Phones', NULL, NULL, NULL, 50, 'PriceDesc')
```

The route uses regex to safely extract parameters for logging purposes only. The actual query is still executed as-is (with low privileges).

---

## Request / Response Format

### Request Body

```json
{
  "query": "SELECT * FROM dbo.Part2('L7WDZWC8', 'Electronics', NULL, NULL, NULL, NULL, 50, 'PriceDesc')"
}
```

### Successful Response (200)

```json
[
  {
    "Source": "awin",
    "SubCategory": "Mobile Phones",
    "ID": 12345,
    "Title": "iPhone 15 Pro",
    "Price": "£899.00",
    ...
  }
]
```

### Error Responses

| Status | Error Message                              | Cause |
|--------|--------------------------------------------|-------|
| 400    | `Query is required`                        | Missing `query` field |
| 400    | `Unsupported query format`                 | Query doesn't match `Menu` or `Part2` pattern |
| 500    | `Low-privilege database credentials not configured` | Missing ENV vars |
| 500    | (various)                                  | Database error or execution failure |

---

## Security Considerations

- This route is **intentionally public** because the `madeira-widget` runs on third-party websites.
- It uses a **dedicated low-privilege database account** with minimal permissions.
- All calls are logged with IP address and parameters.
- Only whitelisted query patterns are accepted (no arbitrary SQL).

---

## Relationship to `madeira-widget.js`

The `madeira-widget.js` (located in `/s3-bucket`) makes unauthenticated calls to this endpoint to fetch the live product catalogue for a given club/partner.

Typical flow:
1. Widget loads on a partner site.
2. Widget calls `/rds` or `/query` with a `Part2` query.
3. This route executes it using low-privilege credentials.
4. Results are rendered in the widget.

---

## File Location

```
API/routes/rdsquery/index.js
```

This is currently a **single-file route** with no separate helpers.

---

## Maintenance Notes

- If you need to support additional query patterns in the future, update the regex matchers and parameter extraction logic carefully.
- Monitor the `DatabaseCallLog` table for unusual activity.
- Keep the low-privilege database user’s permissions as minimal as possible.

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Primary Consumer:** `madeira-widget.js` (public catalogue display)