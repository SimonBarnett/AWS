![Club Madeira](https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/icon-192.png)

# Club Madeira Partner Integration Guide

Welcome to the Club Madeira Partner Program.

This guide is written for **web design agencies, developers, and partners** who build and maintain websites for clubs, associations, and communities. You are the primary onboarding channel for Club Madeira. Through this package you can deliver a complete, professional solution — including a modern **Progressive Web App (PWA)** experience — that your clients can be proud of.

## Partner Role

Partners are not just installers of widgets. You are the trusted technical partner who helps clubs and communities succeed online.

Your responsibilities typically include:
- Building and maintaining the club’s public website
- Integrating all Club Madeira widgets
- Handling branding, user experience, and technical implementation
- Delivering a branded, installable Progressive Web App
- Ongoing support and optimisation for your clients

By using the files and guidance in this package, you can offer a significantly more valuable service to your club clients.

## What’s New: Progressive Web App (PWA) Support

Club Madeira now supports **Progressive Web Apps**. This is a major new offering you can provide to your clients.

Clubs can now offer their members and visitors the ability to install the site as a native-feeling app on phones and desktops — fully branded under their own domain.

**For detailed PWA setup instructions, please read:**

→ **[PWA_readme.md](./PWA_readme.md)**

This new guide covers `manifest.json`, `sw.js`, icon replacement, testing, and best practices.

## Overview

This package enables you to integrate the following into any static website:

- Public home page
- Login and signup flows for merchants and communities
- Authenticated dashboard with performance charts
- API key management
- Discount category management (Smart Catalogue)
- Full Progressive Web App experience (installable, offline-capable)

All widgets are lightweight and designed for static hosting (Amazon S3, Netlify, Vercel, IONOS, Fasthosts, etc.).

## Prerequisites

Before you begin, you should have:

- Your unique **affiliate code** (e.g. `PARTNER123`)
- A static hosting platform
- Basic knowledge of HTML, CSS, and JavaScript
- Access to your client’s website file structure

## Hosting Options

Club Madeira widgets are designed for static hosting. Recommended platforms include:

- **Amazon S3** – Cost-effective and scalable
- **Netlify** – Excellent free tier and easy deployments
- **Vercel** – Great developer experience
- **IONOS** and **Fasthosts** – Popular UK options with local support and GDPR compliance

For most UK-based partners, **IONOS** or **Fasthosts** offer a good balance of support and simplicity. Amazon S3 remains the most flexible and cost-effective for larger deployments.

## Setup Instructions

### 1. Download the Partner Package

Copy the files from the `HOST/partner/` folder into your project. Key files include:

- `header-widget.js` (updated with PWA support)
- `manifest.json` (PWA configuration)
- `sw.js` (Service Worker)
- `PWA_readme.md` (detailed PWA guide)
- `images/icon-192.png` and `images/icon-512.png` (replace with client branding)
- Plus the other widget scripts from the S3 bucket as needed

### 2. Configure `index.json`

Create a file called `index.json` at the root of your site:

```json
{
  "loginUrl": "/login.html",
  "affiliateCode": "YOUR_AFFILIATE_CODE",
  "signupLinkUrl": "/signup.html"
}
```

- `loginUrl`: URL to your login page
- `affiliateCode`: Your unique partner code
- `signupLinkUrl`: URL to your signup page

This file must be publicly accessible.

### 3. Set Up the Progressive Web App (PWA)

Follow the dedicated guide:

**→ [PWA_readme.md](./PWA_readme.md)**

This replaces the older PWA instructions. It uses local icon paths so each partner can easily brand the app for their clients.

### 4. Integrate the Widgets

#### Header Widget (required on all pages)

```html
<header 
  data-header-widget 
  data-page-name="Dashboard" 
  data-requireToken="true">
</header>

<script src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/header-widget.js"></script>
```

- Use `data-requireToken="true"` on protected pages (dashboard, api-keys, category)
- Use `data-requireToken="false"` on public pages (login, signup, index)

#### Login Widget

```html
<div id="login-widget"></div>

<script 
  data-login-widget 
  data-container-id="login-widget"
  src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/login-widget.js">
</script>
```

#### Signup Widget

```html
<div id="signup-widget"></div>

<script 
  data-signup-widget 
  data-container-id="signup-widget"
  src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/signup-widget.js">
</script>
```

#### Other Widgets (Dashboard, API Keys, Category, Charts)

Add the relevant container `<div>` and include the corresponding script from the S3 bucket. Full examples are available in the individual widget documentation and the old template files.

#### Footer (recommended)

```html
<footer id="footer"></footer>

<script>
  fetch('footer.html')
    .then(res => res.text())
    .then(html => document.getElementById('footer').innerHTML = html);
</script>
```

Create a `footer.html` file with your client’s contact information and links.

### 5. Authentication Flow

- Public pages use `data-requireToken="false"`
- Protected pages use `data-requireToken="true"` and will redirect unauthenticated users to the `loginUrl` defined in `index.json`
- On successful login, the widget stores `authToken`, `user_id`, and `contact_name` in `localStorage`

### 6. Testing

Before going live, verify:

- `index.json` loads without errors
- Header navigation shows correct menu items for logged-in vs logged-out states
- Login and signup flows work end-to-end
- Protected pages redirect correctly when unauthenticated
- PWA installation prompt appears (Chrome DevTools → Application → Manifest)
- All widgets render and function as expected
- Footer loads correctly

### 7. Deployment Example: Amazon S3

1. Create an S3 bucket in `eu-west-2`
2. Enable **Static website hosting**
3. Upload all files (including `index.json`, `manifest.json`, `sw.js`, and images)
4. Apply a bucket policy for public read access
5. Test using the S3 website endpoint
6. (Optional) Add a custom domain via CloudFront or Route 53

## Support

- Technical questions about widgets and integration → Club Madeira support
- Questions specifically about PWA setup → First read `PWA_readme.md`, then contact support
- Feedback from active partners is always welcome

Thank you for being a Club Madeira Partner. You play a vital role in helping clubs and communities build professional, modern digital presences.

---

**Last updated:** June 2026  
**Version:** Updated with full Progressive Web App support and clarified partner onboarding role.