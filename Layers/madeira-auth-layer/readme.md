# Madeira Auth Layer (`madeira-auth-layer`)

This is a **thin, focused Lambda Layer** dedicated to authentication utilities — primarily JWT signing and verification.

It is intentionally small and depends on the **Core Layer** for configuration and logging.

**Location in repo:** `Layers/madeira-auth-layer/`

---

## Purpose

- Provide clean `signJWT()` and `verifyJWT()` functions
- Centralize JWT logic so it can be updated independently of business code
- Depend on the Core Layer for secrets and logging (single source of truth)

---

## Folder Structure

```
Layers/madeira-auth-layer/
└── nodejs/
    └── jwt.js          ← Main (and only) module
```

---

## Main Module: `jwt.js`

### Exports

| Function       | Description                              | Returns                  |
|----------------|------------------------------------------|--------------------------|
| `signJWT(payload, options?)`   | Signs a JWT token                        | `Promise<string>`        |
| `verifyJWT(token)`             | Verifies and decodes a JWT token         | `Promise<object>`        |

### Example Usage

```js
const { signJWT, verifyJWT } = require('/opt/nodejs/jwt');

// Sign a token
const token = await signJWT({
    user_id: 'L7WDZWC8',
    permissions: ['partner', 'admin'],
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
});

// Verify a token
try {
    const decoded = await verifyJWT(token);
    console.log(decoded.user_id);
} catch (err) {
    console.error('Invalid or expired token');
}
```

---

## Dependencies

This layer has a **hard dependency** on the **Core Layer** (`madeira-core-layer`).

It imports:

- `getJwtConfig()` — to retrieve the JWT secret from SSM
- `logger` — for structured logging

**See Core Layer documentation for:**
- How the JWT secret is loaded and cached
- SSM parameter: `/madeira/jwt/secret-key`
- Self-healing placeholder behavior

→ [Core Layer README](../madeira-core-layer/readme.md#2-jwt-jwt-configjs)

---

## Important Notes

- The layer uses **HS256** algorithm only.
- It does **not** manage the secret itself — that responsibility belongs to the Core Layer.
- All errors are logged with a unique `transactionId` for easier debugging in CloudWatch.
- Tokens are expected to include at minimum `user_id` and `permissions`.

---

## When to Use This Layer

Use `madeira-auth-layer` in any Lambda that needs to:

- Issue new JWTs after login / onboarding / password reset
- Validate incoming JWTs from API Gateway authorizers or direct calls

Do **not** duplicate JWT logic in individual services.

---

**Last Updated:** 14 June 2026  
**Maintained by:** Simon Barnett (Club Madeira)  
**Depends on:** `madeira-core-layer` (for JWT config + logging)