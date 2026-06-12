# mailer

## Overview
Email sending abstraction used across the platform.

## Purpose
- Provide consistent interface for sending emails
- Support HTML, text, attachments, and inline images
- Abstract underlying email service (SES or similar)

## Usage
Mainly called from `SQS/madeira-sqs-catalogue/emails.js`.

## Notes
Email sending is intentionally moved out of the API layer for better performance and reliability.

---
*Part of the hierarchical documentation on the `feature/documentation` branch.*