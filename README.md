# Madeira AWS Repository

## Overview

This repository contains the backend infrastructure and application code for the **Club Madeira** platform.

It uses a serverless architecture with AWS Lambda, API Gateway, SQS, Lambda Layers, RDS (SQL Server), and S3.

## High-Level Architecture

```
[JS Widgets (S3)]
       ↓
[API Gateway] → [API Lambda] → [RDS: SystemOTPs, Users, clubscan...]
       ↓
[SQS] → [SQS Catalogue Processor] → ClubScan / Email / Notifications
       ↓
[Standalone Lambdas] (e.g. Amazon Card Top-up)
```

## Repository Structure

| Folder                        | Purpose | Key Contents |
|-------------------------------|---------|--------------|
| `API/`                        | Main HTTP API | `routes/token/`, `routes/ui/` |
| `Lambdas/`                    | Standalone workers | `amazoncard-topup/` |
| `SQS/madeira-sqs-catalogue/`  | Async processing | `sqs/`, `emails.js` |
| `nodejs/`                     | Lambda Layers (shared code) | `helpers/`, `conf/`, `mailer/`, `jwt/` |
| `S3-Bucket/`                  | Frontend widgets | Widget JS/CSS |

## Documentation Approach

This repo uses hierarchical READMEs:
- Each major folder has a `README.md`
- Parent folders describe their children
- Goal: Make the codebase easy to navigate

See individual folder READMEs for details.

---
*Documentation on `feature/documentation` branch.*