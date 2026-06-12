# jwt

## Overview
JWT signing and verification utilities.

## Key Functions
- `signJWT(payload)` – Create signed tokens
- `verifyJWT(token)` – Validate and decode tokens

## Usage
Used throughout authentication flows (onboarding, delegation, login, password reset).

## Notes
Tokens usually contain minimal claims (`user_id`, `permissions`, `exp`).

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*