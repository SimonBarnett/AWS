# Winston Logging Endpoint (`/API/routes/winston`)

**Purpose:**  
This is a **public endpoint** that allows external JavaScript code (widgets, partner scripts, browser extensions, etc.) to send structured log messages directly to CloudWatch.

It is primarily used by the various Madeira widgets (`madeira-widget.js`, `category-widget.js`, `header-widget.js`, etc.) running on third-party websites to report errors, debug information, and usage data.

---

## Key Characteristics

| Aspect                    | Details |
|---------------------------|---------|
| **Route**                 | `/winston` |
| **Authentication**        | None (public endpoint) |
| **Method**                | `POST` (with CORS support) |
| **Log Level**             | **Always `debug`** in the API context (ignores global `LOG_LEVEL`) |
| **Primary Consumers**     | External JS widgets and scripts |
| **Destination**           | CloudWatch Logs (via the core Winston logger) |

---

## Why This Route Exists

Many Madeira widgets run on **external partner websites**. These widgets need a way to report issues back to the Madeira team without requiring authentication or complex setup.

This endpoint provides a simple, fire-and-forget logging mechanism that writes directly to CloudWatch.

---

## Request Format

### POST `/winston`

```json
{
  "level": "error",           // optional - defaults to "info"
  "message": "Failed to load catalogue",
  "source": "madeira-widget",
  "url": "https://partner-site.com/page",
  "userAgent": "Mozilla/5.0...",
  "context": {
    "userId": "L7WDZWC8",
    "errorCode": "CATALOGUE_LOAD_FAILED",
    "retryCount": 3
  }
}
```

### Required Fields

| Field     | Type     | Required | Description |
|-----------|----------|----------|-------------|
| `message` | string   | **Yes**  | The log message |

### Optional Fields

| Field       | Type     | Description |
|-------------|----------|-------------|
| `level`     | string   | Log level (ignored — always treated as debug internally) |
| `source`    | string   | Identifier of the sending script (e.g. `madeira-widget`) |
| `url`       | string   | Page URL where the log originated |
| `userAgent` | string   | Browser user agent |
| `context`   | object   | Any additional structured data |

---

## How It Works

1. Accepts a `POST` request with a JSON body.
2. Extracts key fields (`message`, `context`, `source`, etc.).
3. **Always** calls `logger.debug()` — this ensures logs from external scripts are captured even when the API's `LOG_LEVEL` is set to `info` or higher.
4. Returns a simple success response.
5. The log appears in CloudWatch under the Lambda's log group.

---

## Important Behavior: Always Debug Level

Unlike normal application logging, this route **forces debug level** for all incoming external logs.

This was done intentionally so that issues reported by widgets running on partner sites are never lost due to log level filtering.

---

## CORS Support

The endpoint supports CORS preflight (`OPTIONS`) requests and includes the necessary headers so it can be called from any origin.

---

## Example Usage from JavaScript

```js
// From any external script or widget
fetch('https://ytepcnwske.execute-api.eu-west-2.amazonaws.com/prod/winston', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        message: 'Widget failed to initialize',
        source: 'category-widget',
        context: {
            error: err.message,
            stack: err.stack
        }
    })
});
```

---

## File Location

`API/routes/winston/index.js`

---

## Maintenance Notes

- Do **not** add authentication to this route — it must remain public.
- Keep the "always debug" behavior unless there is a very strong reason to change it.
- Monitor CloudWatch for high volumes of logs from this endpoint (can indicate widespread widget issues).

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Primary Use Case:** External widget error reporting to CloudWatch