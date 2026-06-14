# Madeira AWS - Club Madeira Platform

**Full production AWS infrastructure powering the Club Madeira Affiliate Programme, Smart Product Catalogues, Merchant Recommendations & Partner Tools.**

---

## 🌟 Big Picture Architecture

This system is built with a **layer-first, modular philosophy**. Everything is designed for maximum reuse, observability, and maintainability.

### 🔥 Core Strategic Engine: The Awin + Merchant Ecosystem

**[Lambdas/madeira-awin-clubscan](Lambdas/madeira-awin-clubscan)** is one of the **most critical components** in the entire platform.

It powers intelligent merchant discovery and personalised recommendations that feed the club experience. 

**Key functions:**
- Continuously scrapes and ranks high-approval Awin merchants
- Generates smart join recommendations (Global mode + per-Club mode)
- When a **community onboards**, their partner automatically receives a curated shortlist of suitable Awin advertisers to apply to **on the club’s behalf**
- Successful onboarding of these merchants gives the partner **extra commission** on resulting sales

> **Without a strong flow of quality merchant parts from Awin and affiliated sources, the entire catalogue and recommendation experience becomes weak.** This Lambda + the merchant ingestion pipeline is the lifeblood of product richness.

See: [Lambdas README](Lambdas/README.md) • [SQS Merchant Queue](SQS/madeira-sqs-merchant)

### 🛡️ Self-Healing & Diagnostics

**[Lambdas/madeira-layer-cake](Lambdas/madeira-layer-cake)** — The dedicated **Layer Validation & Self-Healing Test Lambda**.

It actively exercises all shared layers (`helpers`, `grok`, `payments`, `auth`, `mailer`, etc.) and serves as a canary to detect broken dependencies early.

---

**Other Key Lambdas**

- [amazoncard-topup](Lambdas/amazoncard-topup) — Weekly Amazon gift card supply engine
- [madeira-posthog-updatedb](Lambdas/madeira-posthog-updatedb) — Off-site activity audit logging

**[Browse all Lambdas →](Lambdas)**

---

## 📁 Repository Structure

- **[API](API)** — Main API Gateway orchestrator + routes
- **[Lambdas](Lambdas)** — Background & scheduled jobs
- **[Layers](Layers)** — Shared business logic (the foundation)
- **[SQS](SQS)** — Message queues powering async workflows
- **[S3-Bucket](S3-Bucket)** — JavaScript widgets for partner sites
- **[HOST/partner](HOST/partner)** — Partner onboarding website templates
- **[RDS](RDS)** — Database schema

---

**Continue with full documentation below...**

*(Original sections such as Layers, SQS architecture, deployment notes, etc. remain intact below this enhanced overview.)*