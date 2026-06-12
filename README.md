# Madeira AWS Repository

## Overview

This repository contains the backend infrastructure and application code for the **Club Madeira** platform, built on AWS.

It follows a serverless-first architecture using:
- AWS Lambda (API + background processors)
- API Gateway
- Amazon SQS (asynchronous processing & pipelines)
- Lambda Layers (shared code & configuration)
- Amazon RDS (Microsoft SQL Server)
- Amazon S3 (static assets & frontend widgets)

## High-Level Architecture

```
                     [Browser / JS Widgets]
                              ↓
                    [API Gateway + Authorizer]
                              ↓
                       [API Lambda]
            → Token/Auth Routes     → UI Routes
                              ↓
                    [SystemOTPs, Users, ClubScan...]
                              ↓
                    [SQS Message Queue]
                              ↓
              [SQS Catalogue Processor]
         (ClubScan pipeline, Email, Notifications)
                              ↓
              [Standalone Lambdas] (e.g. Amazon Card)
```

## Repository Structure Overview

| Top-Level Folder                  | Responsibility                                      | Key Subfolders / Contents                     |
|-----------------------------------|-----------------------------------------------------|-----------------------------------------------|
| `API/`                            | HTTP-facing API (Lambda + API Gateway)              | `routes/token/`, `routes/ui/`, helpers        |
| `Lambdas/`                        | Standalone / long-running worker Lambdas            | `amazoncard-topup/`                           |
| `SQS/madeira-sqs-catalogue/`      | Central SQS message router and handlers             | `sqs/`, `emails.js`                           |
| `nodejs/` (Lambda Layers)         | Shared libraries, config, and utilities             | `helpers/`, `conf/`, `mailer/`, `sms.js`      |
| `S3-Bucket/`                      | Frontend static assets and Madeira widgets          | Widget JS/CSS files                           |

## Major Components

### 1. API Layer (`API/`)
The main entry point for all HTTP requests.

**Key responsibilities:**
- Authentication & token management (onboarding, delegation, password reset, deletion)
- UI data endpoints (metrics, charts, API keys)
- Business logic orchestration

See `API/README.md` for detailed documentation.

### 2. Background Processing

**SQS Catalogue Processor** (`SQS/madeira-sqs-catalogue/`)
- Central orchestrator for asynchronous work
- Handles ClubScan pipeline stages
- Sends emails via `SystemOTPs` flow

**Standalone Lambdas** (`Lambdas/`)
- Longer-running or external integration tasks (e.g. Amazon Gift Card top-up)

### 3. Shared Code & Configuration (`nodejs/`)
Deployed as Lambda Layers.

Contains:
- Database access + `executeWithRetry`
- JWT signing/verification
- Email (mailer) and SMS clients
- SSM-based configuration loaders
- Common helpers and utilities

### 4. Data Stores
- **RDS (SQL Server)**: Primary transactional database (`Users`, `SystemOTPs`, `clubscan`, etc.)
- **S3**: Static hosting for Madeira widgets and any file storage

## Documentation Structure

This repository uses a hierarchical documentation approach:

- Each folder contains a `README.md` describing its **contents** and purpose.
- Parent folders summarize their child folders and how they are used.
- The goal is to make the repository self-documenting and easy to navigate.

## Getting Started

1. Clone the repository
2. Review the `README.md` in key folders (`API/`, `SQS/`, `nodejs/`)
3. Refer to individual route and handler files for implementation details

## Contributing

When adding new code or folders, please update the relevant `README.md` files following the established structure.

---

*Documentation maintained on the `feature/documentation` branch.*