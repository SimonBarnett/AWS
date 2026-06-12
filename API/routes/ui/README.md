# UI Routes (`API/routes/ui/`)

## Overview
This folder contains API endpoints that primarily serve data to internal dashboards and UI components.

## Purpose
- Provide metrics, charts, and reporting data
- Manage user settings (e.g. API keys)
- Support dashboard visualizations

## Contents

| File              | Type | Description |
|-------------------|------|-------------|
| `index.js`        | File | Router for UI routes |
| `metrics.js`      | File | Key business metrics |
| `chartData.js`    | File | Data for charts and graphs (complex queries) |
| `apiKeys.js`      | File | API key management (CRUD) |
| `category.js`     | File | Category-related data and ClubScan status |

## Key Patterns
- Uses shared database pool from main router
- Heavy use of `executeWithRetry`
- Some endpoints return large datasets
- Role-based data filtering is common

## Related Components
- `SystemOTPs` and `clubscan` tables
- SQS Catalogue Processor (for status updates)

## Notes
`chartData.js` is one of the more complex and query-heavy files in the codebase.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*