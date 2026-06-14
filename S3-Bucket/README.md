# Partner Site Widgets - Documentation

This document describes all JavaScript widgets used across the Club Madeira partner website templates located in `/HOST/partner/`.

These widgets are self-contained, loaded from S3, and designed to work with the refactored AWS Lambda API (as of June 2026).

---

## Widget Inventory

| #  | File                          | Purpose                                                                 | Key Features                                      | Used In (HTML Files)                          | API Routes Used                                      | Status (June 2026)      |
|----|-------------------------------|-------------------------------------------------------------------------|---------------------------------------------------|-----------------------------------------------|------------------------------------------------------|-------------------------|
| 1  | `header-widget.js`            | Main navigation, authentication state, logout, and PWA support         | Local JWT decoding, dynamic menu, PWA install prompt | Almost every page (index, dashboard, category, api-keys, login, signup, delegate, etc.) | None (client-side only)                             | ✅ Reviewed & Updated  |
| 2  | `role-widget.js`              | Visual role selector / explainer on public pages                       | Simple cycling display of roles                   | `index.html`                                  | None                                                 | ✅ Visual only         |
| 3  | `login-widget.js`             | Login form + password reset flow                                       | Email/password, reset password, local JWT         | `login.html`                                  | `/login`, `/login/reset-password`, `/login/verify-reset-code` | ✅ Reviewed            |
| 4  | `signup-widget.js`            | New user onboarding (Community / Merchant / Partner)                   | Generate token, validate PIN + set password       | `signup.html`                                 | `/login/generate-onboarding-token`, `/login/validate-onboarding-token` | ✅ Reviewed            |
| 5  | `partner-widget.js`           | Invite new users (pure invite mode)                                    | Role selection, ToS, generate onboarding token    | `partner.html`                                | `/login/generate-onboarding-token`, `/login/validate-onboarding-token` | ✅ Reviewed & Cleaned  |
| 6  | `dashboard-widget.js`         | Main dashboard layout and widget orchestrator                          | Loads chart, metrics, api-keys, category widgets  | `dashboard.html`                              | None (orchestrator)                                  | ✅ Reviewed            |
| 7  | `metrics-widget.js`           | Displays key account metrics                                           | Fetches pre-rendered HTML from backend            | `dashboard.html`                              | `/ui/metrics`                                        | ✅ Reviewed            |
| 8  | `chart-widget.js`             | Performance charts (bar charts by granularity)                         | Chart.js integration, day/week/month              | `dashboard.html`                              | `/ui/chart-data`                                     | ✅ Reviewed & Repaired |
| 9  | `category-widget.js`          | AI-powered discount category management with TTS/STT                   | Prompt input, speech recognition, help tour, polling | `category.html`                               | `/ui/category`, `/ui/category/reset`                 | ✅ Reviewed (Complex)  |
| 10 | `api-widget.js`               | Manage third-party API keys + merchant role request                    | Add/Delete keys, provider selection, ToS flow     | `api-keys.html`                               | `/ui/api-keys`, `/ui/api-keys/providers`, `/login/tos`, `/login/add-role` | ✅ Reviewed            |
| 11 | `user-widget.js`              | Display current user info and delegation options                       | Shows user details                                | `delegate.html`                               | None (client-side)                                   | Reviewed               |
| 12 | `catalog-preview-widget.js`   | Preview of catalog results (used in some partner flows)                | Displays sample catalogue data                    | Various preview flows                         | `/query` or `/rds`                                   | Reviewed               |
| 13 | `madeira-extension.js`        | Promotes browser extension download                                    | Detects OS and shows correct store badge          | Standalone extension promo page               | None                                                 | Reviewed               |
| 14 | `merchant-parts.js`           | Merchant parts / product management widget                             | Product browsing and selection                    | Merchant-specific pages                       | `/rds` (Part2 function)                              | Reviewed               |

---

## Summary of Changes (June 2026 Refactor)

- Removed all calls to the deprecated `/login/claims` endpoint.
- All widgets now use **local JWT decoding** (`decodeToken()`) to read permissions from the token stored in `localStorage`.
- Consolidated token handling into `SystemOTPs` table.
- All routes updated to new structure under `/login/*` and `/ui/*`.
- `partner-widget.js` was cleaned to **pure invite mode** (removed myurls/buyurl/Sites toggle).

---

## Recommended Loading Order (in HTML)

```html
<!-- 1. Header (always first) -->
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/header-widget.js"></script>

<!-- 2. Role widget (public pages) -->
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/role-widget.js"></script>

<!-- 3. Login / Signup -->
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/login-widget.js"></script>
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/signup-widget.js"></script>

<!-- 4. Partner invite widget -->
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/partner-widget.js"></script>

<!-- 5. Dashboard widgets -->
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/dashboard-widget.js"></script>
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/metrics-widget.js"></script>
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/chart-widget.js"></script>
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/category-widget.js"></script>
<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/api-widget.js"></script>
```

---

## Notes for Partners

- All widgets are **self-contained** and do not require a build step.
- Authentication state is managed via `localStorage` (`authToken`, `user_id`, `contact_name`).
- Most widgets gracefully handle missing tokens by redirecting to the login page.
- For best results, always load `header-widget.js` first.

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)