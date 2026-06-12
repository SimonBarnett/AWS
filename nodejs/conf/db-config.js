# db-config.js

## Overview
Manages database connection pool configuration.

## Key Function
- `getDbPool()`: Returns cached MSSQL connection pool

## Important Notes
- Call once per Lambda invocation
- Pass pool down to handlers
- Do not create or close pools inside route handlers

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*