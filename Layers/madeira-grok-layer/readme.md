# Madeira Grok Layer (`madeira-grok-layer`)

This layer provides **Grok / xAI integration** utilities, with a focus on **structured JSON output** (both real-time streaming and batch processing).

**Location in repo:** `Layers/madeira-grok-layer/`

---

## Overview

The layer contains two main modules:

| File              | Purpose                                      | Key Features |
|-------------------|----------------------------------------------|--------------|
| `grok.js`         | Real-time structured calls                   | Streaming, JSON Schema enforcement, Ajv validation, automatic array unwrapping |
| `grok-batch.js`   | xAI Batch API integration                    | JSONL batch submission, status polling, paginated result retrieval |

Both modules rely on the **Core Layer** for configuration (`getGrokConfig`).

---

## 1. `grok.js` — Real-time Structured Calls

### Main Function: `callGrokStructured(messages, schema, options = {})`

**Signature:**
```ts
async function callGrokStructured(
    messages: Array<{role: string, content: string}>,
    schema: object,           // JSON Schema
    options?: {
        model?: string,
        temperature?: number,
        max_tokens?: number,
        top_p?: number
    }
): Promise<any>
```

### How It Works

1. **Schema Wrapping** (for arrays)
   - If you pass an array schema (`{ type: "array", items: {...} }`), the layer automatically wraps it in an object:
     ```json
     {
       "type": "object",
       "properties": { "data": <your array schema> },
       "required": ["data"]
     }
     ```
   - After parsing, it unwraps `parsed.data` so you still receive a clean array.

2. **Modern JSON Schema Mode**
   - Uses xAI’s `response_format` with `json_schema`:
     ```json
     {
       "response_format": {
         "type": "json_schema",
         "json_schema": {
           "name": "structured_response",
           "strict": true,
           "schema": responseSchema
         }
       }
     }
     ```

3. **Streaming Implementation**
   - Uses proper Node.js `for await...of` on `response.body`
   - Accumulates deltas from `choices[0].delta.content`
   - Handles partial JSON chunks gracefully

4. **Validation + Retry**
   - Uses **Ajv** to validate the final parsed object against your schema
   - If validation fails, it retries (up to `MAX_RETRIES`)
   - Only throws after exhausting retries

### Example Usage

```js
const { callGrokStructured } = require('/opt/nodejs/grok');

const schema = {
    type: "object",
    properties: {
        relevance_score: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" }
    },
    required: ["relevance_score", "reason"]
};

const result = await callGrokStructured(
    [
        { role: "system", content: "You are a product relevance judge." },
        { role: "user", content: `Product: ${title}\nQuery: ${query}` }
    ],
    schema,
    { temperature: 0.1, max_tokens: 500 }
);

console.log(result.relevance_score);
```

---

## 2. `grok-batch.js` — Batch Processing

This module wraps the **xAI Batch API** for high-volume structured requests.

### Key Functions

| Function                    | Description                                      | Returns          |
|-----------------------------|--------------------------------------------------|------------------|
| `submitStructuredBatch(requests, schema, options)` | High-level helper (wraps schema automatically) | Batch object     |
| `submitBatch(batchRequests)` | Low-level: accepts pre-built batch request objects | Batch object |
| `getBatchStatus(batchId)`   | Check status of a submitted batch                | Batch status     |
| `getBatchResults(batchId)`  | Fetch **all** results (handles pagination)       | Array of results |

### How Batching Works

1. `submitStructuredBatch` converts your requests into the xAI batch format with `json_schema`.
2. It creates a `.jsonl` file and uploads it via `/files`.
3. It then creates a batch job via `/batches` with `completion_window: "24h"`.
4. You poll with `getBatchStatus(batchId)` until `status === "completed"`.
5. Finally, call `getBatchResults(batchId)` to retrieve all outputs (handles pagination automatically).

### Example: Submitting a Batch

```js
const { submitStructuredBatch, getBatchStatus, getBatchResults } = require('/opt/nodejs/grok-batch');

const requests = products.map(p => ({
    custom_id: p.id,
    messages: [
        { role: "system", content: "You are a product categorizer." },
        { role: "user", content: `Categorize: ${p.title}` }
    ]
}));

const schema = {
    type: "object",
    properties: {
        category: { type: "string" },
        confidence: { type: "number" }
    },
    required: ["category", "confidence"]
};

const batch = await submitStructuredBatch(requests, schema, {
    model: "grok-4",
    max_tokens: 300
});

console.log("Batch submitted:", batch.id);

// Later...
const status = await getBatchStatus(batch.id);
if (status.status === "completed") {
    const results = await getBatchResults(batch.id);
    // results contains one entry per request
}
```

---

## Configuration (from Core Layer)

See the Core Layer documentation for all Grok-related SSM parameters:

→ [Core Layer – Grok Config](../madeira-core-layer/readme.md)

Key parameters used by this layer:
- `XAI_API_KEY`
- `GROK_API_URL`
- `DEFAULT_MODEL` (usually `grok-4` or `grok-4.3`)
- `MAX_RETRIES`, `TIMEOUT_MS`, etc.

---

## Important Implementation Details

- **Strict Mode**: Controlled by `GROK_STRICT` env var (defaults to `true`).
- **Streaming**: Only `grok.js` uses streaming. Batch jobs are non-streaming.
- **Error Handling**: Both modules include retry logic and detailed logging with `transactionId`.
- **Schema Validation**: `grok.js` validates every response with Ajv. Batch mode relies on xAI’s strict schema enforcement.

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Depends on:** `madeira-core-layer` (for config)