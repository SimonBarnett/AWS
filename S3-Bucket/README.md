# S3-Bucket (Frontend Assets & Widgets)

## Overview
This folder contains static assets served via Amazon S3, primarily the **Madeira Widget** — the JavaScript and CSS embed that powers the frontend integration on partner and community websites.

## Purpose
- Host the embeddable Madeira widget
- Serve associated CSS and configuration
- Provide versioned builds for reliable embedding

## Typical Contents

| File                    | Description                              |
|-------------------------|------------------------------------------|
| `madeira-widget.js`     | Main embeddable widget script            |
| `madeira-widget.css`    | Styling for the widget                   |
| Versioned builds        | Files with `?v=` query parameters        |

## How It's Used
Partner/community sites embed the widget using a script tag like:
```html
<script src="https://madeira-widget-bucket.s3.../madeira-widget.js?v=1.0"></script>
```

## Related Components
- `API/routes/ui/` — May serve widget configuration or dynamic data
- ClubScan pipeline — Analyzes sites that have the widget embedded
- `SQS/madeira-sqs-catalogue/` — Triggers analysis when new sites are onboarded

## Notes
This folder is mostly static. Updates here usually involve widget improvements rather than backend logic changes.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*