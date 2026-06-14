# Token / Auth Routes (`/API/routes/token`)

This folder contains all authentication, onboarding, delegation, and password reset functionality for the Madeira platform.

All routes are mounted under `/login/*` (via the main API orchestrator) and receive a shared database `pool` + `sandbox` flag from the parent router.

---

## Current Active Routes (as of June 2026)

| Path                                | Method | Handler File          | Action          | Description |
|-------------------------------------|--------|-----------------------|-----------------|-------------|
| `/login`                            | POST   | `login.js`            | —               | User login with email + password |
| `/login/reset-password`             | POST   | `reset-password.js`   | `request`       | Request password reset (sends SMS OTP) |
| `/login/verify-reset-code`          | POST   | `reset-password.js`   | `verify`        | Verify OTP + set new password |
| `/login/onboarding`                 | GET    | `onboarding.js`       | `complete`      | Final step of onboarding flow |
| `/login/complete-signup`            | POST   | `onboarding.js`       | `complete-signup` | Complete signup after Stripe onboarding |
| `/login/tos`                        | GET    | `tos.js`              | —               | Serve Terms of Service from S3 |
| `/login/generate-onboarding-token`  | POST   | `onboarding.js`       | `generate`      | Generate onboarding token + send email/SMS |
| `/login/validate-onboarding-token`  | PUT    | `onboarding.js`       | `validate`      | Validate PIN from onboarding token |
| `/login/delegate`                   | POST   | `delegate.js`         | `initiate`      | Initiate account delegation |
| `/login/acceptdelegation`           | POST   | `delegate.js`         | `accept`        | Accept delegation with OTP |

> **Note:** The old `/login/delete` and `/login/deleteconfirm` routes were moved to the UI layer. The `addRole` route is currently not mounted in the token router.

---

## Detailed Route Documentation

### 1. `POST /login` — Login

**File:** `login.js`

**Purpose:**  
Authenticates a user with email + password and returns a JWT.

**Key Behavior:**
- Validates email + password
- Checks affiliate code via `verifyAffiliate`
- Uses `comparePassword` from core layer
- Generates JWT via `signJWT`
- Records last login via `setLastLogin`
- Returns `token`, `user_id`, `contact_name`, and optional `lastlogin` message

**Important Notes:**
- This is one of the few public routes (no JWT required).
- Uses the refactored `getUserByEmail` and `setLastLogin` helpers that accept a passed `pool`.

---

### 2. Password Reset Flow

#### `POST /login/reset-password` (action: `request`)

**File:** `reset-password.js`

**Purpose:**  
Initiates a password reset by generating an OTP and sending it via SMS.

**Key Behavior:**
- Looks up user by email
- Cleans up old reset tokens in `SystemOTPs`
- Generates 6-digit PIN
- Stores OTP in `SystemOTPs` table with `token_type = 'password_reset'`
- Sends SMS via `sendSmsTextmagic`
- Rate limiting / cleanup logic is included

#### `POST /login/verify-reset-code` (action: `verify`)

**File:** `reset-password.js`

**Purpose:**  
Verifies the OTP and sets the new password.

**Key Behavior:**
- Validates OTP from `SystemOTPs`
- Hashes new password using `hashPassword` from core layer
- Updates user password via `updateUserPassword`
- Deletes used OTP
- Signs and returns a new JWT
- Records last login

---

### 3. Onboarding Flow

The onboarding system was consolidated into a single file (`onboarding.js`) that handles multiple actions.

#### `POST /login/generate-onboarding-token` (action: `generate`)

**Purpose:**  
Creates an onboarding token/PIN for new users (partner, community, or merchant) and triggers email/SMS.

**Key Behavior:**
- Validates input
- Generates PIN and stores in `SystemOTPs`
- Enqueues email via SQS catalogue (`SEND_EMAIL`)
- Returns token to caller

#### `PUT /login/validate-onboarding-token` (action: `validate`)

**Purpose:**  
Validates the PIN entered by the user during onboarding.

**Key Behavior:**
- Looks up token in `SystemOTPs`
- Validates PIN and expiry
- Returns next step info (e.g. Stripe account link for merchants)

#### `GET /login/onboarding` (action: `complete`)

**Purpose:**  
Final step after user completes Stripe onboarding.

#### `POST /login/complete-signup` (action: `complete-signup`)

**Purpose:**  
Creates the final user record after successful Stripe onboarding and password setup.

---

### 4. `GET /login/tos` — Terms of Service

**File:** `tos.js`

**Purpose:**  
Serves Terms of Service text from S3 based on `service` or `token` query parameter.

**Key Behavior:**
- Supports `service=partner|community|merchant` or lookup via onboarding token
- Fetches from S3 bucket defined in `TOS_BUCKET` env var
- Returns plain text with `Content-Type: text/plain`

---

### 5. Delegation Flow

#### `POST /login/delegate` (action: `initiate`)

**File:** `delegate.js`

**Purpose:**  
Allows an existing user to delegate access to another person (creates a delegation token + OTP).

**Key Behavior:**
- Validates input (name, phone, email)
- Stores delegation request in `SystemOTPs`
- Sends invitation email/SMS

#### `POST /login/acceptdelegation` (action: `accept`)

**File:** `delegate.js`

**Purpose:**  
Accepts a delegation invitation using the OTP.

**Key Behavior:**
- Validates OTP from `SystemOTPs`
- Creates or updates the delegated user
- Signs and returns a JWT for the new user
- Enqueues "delegation accepted" email via SQS

---

## Shared Patterns Across Token Routes

- All routes receive `{ pool, sandbox }` from the parent router.
- **No route closes the database pool** (prevents "Connection is closed" errors).
- OTP / PIN handling was consolidated into the `SystemOTPs` table.
- Most email sending was moved to SQS catalogue (`enqueueMessage` with type `SEND_EMAIL`).
- Password hashing and comparison use functions from the core layer.

---

## File Structure

```
API/routes/token/
├── index.js                 # Router
├── login.js
├── reset-password.js
├── onboarding.js            # Consolidated (generate, validate, complete, complete-signup)
├── tos.js
├── delegate.js              # initiate + accept
└── helpers.js               # Local helpers (getUserByEmail, generatePin, parseBody, etc.)
```

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)