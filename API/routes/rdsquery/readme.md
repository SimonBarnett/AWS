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

## Strict Environment Variable Requirement

**The low-privilege database password MUST ALWAYS come from the environment variable.**

- `DB_LOW_PRIV_PASSWORD` is read **exclusively** from `process.env`.
- **No fallbacks** to SSM Parameter Store, config files, defaults, or any other source are permitted.
- If the required environment variables are missing, the Lambda will fail to initialize with a clear fatal error.

### Required Environment Variables

| Variable                  | Purpose                                      | Sensitivity |
|---------------------------|----------------------------------------------|-------------|
| `DB_LOW_PRIV_USER`        | Low-privilege database username              | High        |
| `DB_LOW_PRIV_PASSWORD`    | Low-privilege database password (ENV VAR ONLY) | **Secret**  |

> These credentials should have **read-only** access to the necessary tables/functions.

---

## How It Works

1. At cold start, the module checks that `DB_LOW_PRIV_USER` and `DB_LOW_PRIV_PASSWORD` exist in the environment. If either is missing, it throws a fatal error immediately (no fallbacks).
2. Receives a request containing a raw T-SQL query string.
3. Validates that the query matches one of two allowed patterns.
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

---

## Request / Response Format

### Request Body

```json
{
  "query": "SELECT * FROM dbo.Part2('L7WDZWC8', 'Electronics', NULL, NULL, NULL, NULL, 50, 'PriceDesc')"
}
```

### Successful Response (200)

Returns the recordset as a JSON array.

### Error Responses

| Status | Error Message                              | Cause |
|--------|--------------------------------------------|-------|
| 400    | `Query is required`                        | Missing `query` field |
| 400    | `Unsupported query format`                 | Query doesn't match `Menu` or `Part2` pattern |
| 500    | Various                                    | Database or execution error |

---

## Security Model

- This route is **intentionally public** (used by widgets on third-party sites).
- It uses a **dedicated low-privilege database account**.
- The password is **never** sourced from anywhere except the Lambda environment variable.
- All calls are logged with IP and parameters.

---

## File Location

`API/routes/rdsquery/index.js`

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)