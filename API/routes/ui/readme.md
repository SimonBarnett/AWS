# UI Routes (`/API/routes/ui`)

This folder contains all authenticated UI/dashboard functionality for logged-in users (partners, merchants, communities).

All routes require a valid JWT (decoded by the main orchestrator) and receive a shared `pool` + `sandbox` flag.

---

## Current Active Routes

| Path                    | Method     | Handler File         | Description |
|-------------------------|------------|----------------------|-------------|
| `/cms-providers`        | GET/POST   | `cmsProviders.js`    | Manage CMS provider API keys/settings |
| `/api-keys`             | GET/POST/DELETE | `apiKeys.js`     | Manage user API keys for various providers |
| `/metrics`              | GET        | `metrics.js`         | Dashboard metrics / KPIs |
| `/chart-data`           | GET        | `chartData.js`       | Chart data for reports (granularity, reportType) |
| `/merchant-parts`       | GET        | `merchantParts.js`   | Merchant parts / products data |
| `/category`             | GET/POST   | `category.js`        | User category management (uses `clubscan.Status`) |
| `/category/reset`       | POST       | `reset.js`           | Reset category processing |
| `/delete*`              | POST       | `delete.js`          | Account deletion flow (initiate + confirm) |
| `/add-role`             | POST       | `addRole.js`         | Add merchant role to user |

---

## Detailed Route Documentation

### 1. CMS Providers (`/cms-providers`)

**File:** `cmsProviders.js`

**Purpose:**  
Allows users to configure and manage connections to external CMS platforms (e.g. Magento, Shopify, etc.).

**Key Behavior:**
- Stores API credentials and settings per user.
- Used by backend processes to pull/push data from partner CMS systems.

---

### 2. API Keys (`/api-keys`)

**File:** `apiKeys.js`

**Purpose:**  
CRUD operations for user API keys used with third-party services (OpenAI, TextMagic, etc.).

**Key Behavior:**
- Supports adding, listing, and deleting API keys.
- Keys are stored encrypted or with provider-specific handling.
- Used heavily by the `api-widget.js` in the partner dashboard.

---

### 3. Metrics (`/metrics`)

**File:** `metrics.js`

**Purpose:**  
Returns high-level dashboard KPIs and statistics for the logged-in user.

**Key Behavior:**
- Typically returns counts (orders, revenue, active categories, etc.).
- Used by `metrics-widget.js`.

---

### 4. Chart Data (`/chart-data`)

**File:** `chartData.js`

**Purpose:**  
Provides time-series data for charts on the dashboard.

**Key Behavior:**
- Supports `granularity` (daily/weekly/monthly) and `reportType`.
- Returns data suitable for Chart.js or similar libraries.
- Used by `chart-widget.js`.

---

### 5. Merchant Parts (`/merchant-parts`)

**File:** `merchantParts.js`

**Purpose:**  
Returns product/part data for merchants (used in merchant dashboards).

---

### 6. Category Management (`/category`)

**File:** `category.js`

**Purpose:**  
Core route for managing discount categories for a club/community.

**Key Behavior (Important):**
- **GET**: Checks `clubscan.Status`. Only returns categories when status is `'complete'`.
  - Any other status returns `{ status: 'processing' }` → frontend must show spinner.
  - `*_complete` statuses only mean that specific step finished — not the whole process.
- **POST**: Enqueues a `CATEGORY_UPDATE` message to SQS catalogue for async processing.

This route was refactored to use `clubscan.Status` as the single source of truth instead of the old `isProcessing` flag.

---

### 7. Category Reset (`/category/reset`)

**File:** `reset.js`

**Purpose:**  
Allows a user to reset their category processing state (triggers re-processing).

---

### 8. Delete Account Flow (`/delete`)

**File:** `delete.js`

**Purpose:**  
Handles account deletion (two-step: initiate + confirm with OTP).

**Note:** This was moved from the token layer to UI because it requires authentication.

---

### 9. Add Role (`/add-role`)

**File:** `addRole.js`

**Purpose:**  
Allows an admin/partner to grant the `merchant` role to a user.

---

## Shared Patterns

- All routes receive `{ pool, sandbox }` from the UI router.
- **Pool is never closed inside these handlers** (closed by parent router).
- Most heavy operations are offloaded to SQS (e.g. `CATEGORY_UPDATE`).
- Category route strictly follows the new `clubscan.Status = 'complete'` contract.

---

## File Structure

```
API/routes/ui/
├── index.js
├── apiKeys.js
├── category.js
├── chartData.js
├── cmsProviders.js
├── delete.js
├── addRole.js
├── merchantParts.js
├── metrics.js
└── reset.js
```

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)