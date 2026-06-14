# Madeira Grok Layer (`madeira-grok-layer`)

This layer is intended for **Grok / xAI integration** utilities.

**Current Status (June 2026):**  
The Grok configuration logic currently lives inside the **Core Layer** (`madeira-core-layer`).  
This dedicated layer exists as a placeholder for future expansion of Grok-specific functionality (prompt engineering, tool calling, response parsing, caching, etc.).

**Location in repo:** `Layers/madeira-grok-layer/`

---

## Current Grok Configuration

Grok settings are managed via the Core Layer's `conf/grok-config.js`.

### SSM Parameters

| SSM Parameter                              | Description                        | Default                          |
|--------------------------------------------|------------------------------------|----------------------------------|
| `/madeira/grok/api-key`                    | xAI / Grok API Key                 | `CHANGE_ME`                      |
| `/madeira/grok/api-url`                    | Grok API endpoint                  | `https://api.x.ai/v1/chat/completions` |
| `/madeira/grok/default-model`              | Default model                      | `grok-4`                         |
| `/madeira/grok/default-temperature`        | Sampling temperature               | `0.5`                            |
| `/madeira/grok/default-max-tokens`         | Max output tokens                  | `16000`                          |
| `/madeira/grok/default-top-p`              | Top-p nucleus sampling             | `0.9`                            |
| `/madeira/grok/max-retries`                | Max retry attempts                 | `3`                              |
| `/madeira/grok/timeout-ms`                 | Request timeout (ms)               | `300000` (5 minutes)             |

**Environment variable overrides** are also supported:
- `XAI_API_KEY`
- `GROK_API_URL`
- `DEFAULT_MODEL`
- `DEFAULT_TEMPERATURE`
- `DEFAULT_MAX_TOKENS`
- `DEFAULT_TOP_P`
- `MAX_RETRIES`
- `TIMEOUT_MS`

---

## How to Use (via Core Layer)

```js
const { getGrokConfig } = require('/opt/nodejs/helpers');

const config = await getGrokConfig();

console.log(config.DEFAULT_MODEL);        // grok-4
console.log(config.XAI_API_KEY);          // from SSM or env
```

---

## Future Plans for this Layer

This layer is reserved for:

- Grok-specific prompt builders
- Tool / function calling helpers
- Structured output parsing
- Conversation memory / context management
- Rate limiting and cost tracking for Grok calls

When these utilities are developed, they will be moved here so they can be versioned and updated independently of the core layer.

---

## Related Documentation

- [Core Layer README](../madeira-core-layer/readme.md) — especially the Grok config section

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Note:** Grok configuration currently lives in `madeira-core-layer`