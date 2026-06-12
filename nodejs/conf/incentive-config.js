# incentive-config.js

## Overview
Loads Amazon Gift Card / incentive programme configuration from SSM.

## Features
- 30-minute in-memory caching
- Self-healing placeholders for missing parameters
- Returns normalized config object

## Parameters Managed
- Access keys, partner ID, brand, currency, sandbox mode

## Used By
- `Lambdas/amazoncard-topup/`

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*