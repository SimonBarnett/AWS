# SQS Catalogue Processor

## Overview
Central processor for asynchronous/background work.

## Purpose
- Receive SQS messages from the API and other sources
- Route messages to correct handlers
- Orchestrate multi-step pipelines (especially ClubScan)
- Handle side effects like email sending

## Key Files

| File | Purpose |
|------|---------|
| `index.js` | Main router / dispatcher |
| `emails.js` | All email sending logic |
| `sqs/` | Individual message handlers |

## Message Flow
1. Message arrives with `type` and `payload`
2. `index.js` routes based on `type`
3. Handler performs work (usually with DB pool)
4. May enqueue follow-up messages

See `sqs/README.md` for handler details.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*