# AppVault

AppVault is a full-stack app-download website built for Cloudflare Pages + Pages Functions, D1, and R2.

## Included

- Multi-page public website: Home, Apps, Categories, individual App pages, individual Category pages, About, Contact, Privacy, Terms
- Responsive premium UI with smooth page transitions, reveal effects, interactive 3D tilt cards, and a CSS 3D hero scene
- Search, category filters, featured/latest sections, download counters, screenshots, changelogs, and app metadata
- Secure admin login using Cloudflare environment secrets and an HMAC-signed HttpOnly session cookie
- Admin dashboard for categories and app publishing, APK/icon/screenshot uploads, publish/unpublish, featured toggle, editing, and deletion
- D1 database for metadata, downloads, categories, and contact messages
- R2 storage for APK files, icons, and screenshots
- Ad-ready placements that do not force or trick visitors into ad clicks

## Cloudflare resources expected

Create these in Cloudflare later and bind them to the Pages project:

- D1 binding: `DB`
- R2 binding: `APPS_BUCKET`
- Secret: `ADMIN_EMAIL`
- Secret: `ADMIN_PASSWORD`
- Secret: `SESSION_SECRET` (a long random string)

The public site can be deployed directly from this GitHub repository. The build output directory is `public`; Pages Functions live in `functions`.

## Database

Run `schema.sql` against your D1 database once before using the admin dashboard.

## Local development

```bash
npm install -g wrangler
wrangler pages dev public --d1 DB=<YOUR_D1_ID> --r2 APPS_BUCKET=<YOUR_BUCKET_NAME>
```

For local admin auth, provide the three environment variables in a `.dev.vars` file (never commit that file):

```env
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=choose-a-strong-password
SESSION_SECRET=use-a-long-random-secret
```

## Content and monetization

Only publish apps you own or are licensed to distribute. App descriptions, screenshots, and other site content should be original or properly licensed. Ad placements are intentionally separate from download controls; add an approved ad network after the site has real content and complies with that network's policies.
