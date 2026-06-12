# Madeira AWS Repository

## Overview
This repository contains the full backend for the Club Madeira platform.

**Architecture style**: Serverless-first on AWS.

## Core Components

| Component | Folder | Responsibility |
|-----------|--------|----------------|
| API | `API/` | HTTP endpoints, auth, business logic |
| Background Jobs | `SQS/madeira-sqs-catalogue/` + `Lambdas/` | Async processing, ClubScan, emails |
| Shared Code | `nodejs/` | Lambda Layers (helpers, config, mailer, jwt) |
| Frontend Assets | `S3-Bucket/` | Madeira widget (JS + CSS) |
| Database | RDS (SQL Server) | `Users`, `SystemOTPs`, `clubscan`, etc. |

## Documentation Philosophy

- Every major folder has a `README.md`
- Parent folders describe their children
- Focus on **what** lives in the folder and **why**

See the individual folder READMEs for deeper details.

---
*Maintained on `feature/documentation` branch.*