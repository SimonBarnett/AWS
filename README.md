# Madeira AWS - Full Platform Architecture

**Club Madeira Affiliate & Catalogue Platform** — Production AWS infrastructure powering partner onboarding, merchant catalogues, recommendations, and affiliate tracking.

## 🏗️ Big Picture Architecture

This system is built as a **highly modular, layer-first** AWS platform. The core philosophy is **maximum code reuse and self-healing** through shared Lambda Layers.

### 🔥 The Awin & Merchant Ecosystem — Critical Core

The **most strategically important** part of the system is the **Awin integration layer**:

- **[Lambdas/madeira-awin-clubscan](Lambdas/madeira-awin-clubscan)** — One of the most critical Lambdas in the entire platform.
  - Runs on schedule + triggered during onboarding
  - Discovers high-approval Awin merchants
  - Generates intelligent, personalised recommendations for clubs/communities
  - Powers both **Global** and **Club-specific** recommendation modes
  - Enables partners to apply to merchants **on behalf of** their clubs (earning extra commission)

**Why this matters so much:**
> Without a rich, high-quality pool of **merchant parts** from Awin and other sources, the entire catalogue experience for clubs falls flat. `madeira-awin-clubscan` is the engine that keeps the merchant inventory healthy and relevant.

See also:
- [API/routes/amazoncard](API/routes/amazoncard) (claiming flow)
- [Lambdas/amazoncard-topup](Lambdas/amazoncard-topup) (gift card supply)

### 🛠️ Self-Healing & Diagnostics

- **[Lambdas/madeira-layer-cake](Lambdas/madeira-layer-cake)** — The official **layer compliance and self-healing test Lambda**.
  - Exercises every major layer (`helpers`, `grok`, `payments`, `auth`, etc.)
  - Acts as a canary for broken dependencies
  - Used during deployment and troubleshooting

### Other Key Lambdas

| Lambda | Purpose | Trigger | Status |
|--------|---------|---------|--------|
| [madeira-awin-clubscan](Lambdas/madeira-awin-clubscan) | Awin merchant discovery + smart recommendations | Scheduled + Onboarding | Critical |
| [madeira-posthog-updatedb](Lambdas/madeira-posthog-updatedb) | Off-site activity logging & audit trail | Scheduled | Active |
| [amazoncard-topup](Lambdas/amazoncard-topup) | Weekly Amazon gift card top-up | Weekly | Operational |
| [madeira-layer-cake](Lambdas/madeira-layer-cake) | Layer validation & diagnostics | Manual/Test | Self-healing tool |

---

**Continue reading below for full architecture, layers, SQS queues, and more.**

---

*(The rest of the original README content follows here...)*