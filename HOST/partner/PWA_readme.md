# PWA Configuration for Partners

This document explains how to configure Progressive Web App (PWA) support for partner-branded Club Madeira sites.

## Goal

Allow clubs to install the partner-branded version of the site (e.g. `clubmadeira.yourcompany.tld`) as a native-feeling app on their phone or desktop.

## Files That Must Be Included in the Partner Package

| File / Folder                    | Required | Purpose | Notes |
|----------------------------------|----------|---------|-------|
| `manifest.json`                  | Yes      | Defines app name, icons, start URL, display mode, and theme colors | Must be at the root of the partner site |
| `sw.js`                          | Yes      | Service Worker – enables offline support and faster loading | Must be at the root |
| `/images/icon-192.png`           | Yes      | App icon (192×192) used in manifest and home screen | Replace with partner-branded version |
| `/images/icon-512.png`           | Yes      | App icon (512×512) used in manifest | Replace with partner-branded version |
| `header-widget.js`               | Yes      | Injects PWA meta tags into the page | Updated version required |
| `index.html` (and other pages)   | Yes      | Must reference the header widget | — |

## How to Configure PWA for a Partner

1. **Replace the icons**
   - Put your own branded icons in `/images/icon-192.png` and `/images/icon-512.png`
   - Recommended sizes: 192×192 and 512×512 (PNG format)

2. **Update `manifest.json` (optional but recommended)**
   - Change `"name"` and `"short_name"` to the partner’s branding
   - Update `"theme_color"` and `"background_color"` to match partner branding

3. **Ensure the header widget is loaded**
   - The updated `header-widget.js` must be included on all pages.

4. **Test the PWA**
   - Open the site in Chrome
   - Open DevTools → Application → Manifest
   - Check that icons load correctly and there are no errors
   - Use Lighthouse → PWA audit

## Recommended Icon Guidelines for Partners

- Use a square icon with transparent background or solid color
- Include padding (maskable icons supported in manifest)
- Provide both 192px and 512px versions
- Keep file size under 500KB per icon

## Notes

- The Service Worker (`sw.js`) is configured to bypass API calls to the Madeira backend.
- Icons are now served from the partner domain so they can be easily updated without touching Madeira code.
- This setup allows each partner to have their own branded PWA experience while still using the same underlying Club Madeira functionality.