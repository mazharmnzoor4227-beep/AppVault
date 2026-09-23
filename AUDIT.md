# AppVault review — 23 September 2026

## Implemented

- Shared responsive storefront/publisher styling; search hero, app cards, accessible focus states, reduced motion and mobile layouts.
- Native app/category links; server redirects for existing deep links that previously fell back to the homepage.
- Admin library icons, listing-preserving APK replacement, multipart abort on failed transfers, actual R2 size as authoritative metadata.
- Origin validation before admin proxy rewrites; HttpOnly signed sessions retained; no public admin link or dashboard bundle in the public deployment.
- D1-backed login/contact attempt limits (temporary salted address hashes), generic public errors and response hardening.
- Public media restricted to published icon/screenshot references; raw APK/draft storage keys no longer expose files through the media endpoint.
- Raster image allowlist and signature checks, upload size bounds, HEAD/Range/ETag file delivery, download-start counters updated outside the response path.
- Public catalog/media edge caching for 30 seconds, 24-item catalog pagination and stale-search response protection.
- APK metadata parser served locally, pinned to app-info-parser 1.1.6; license included. No third-party script executes in the admin page.
- Privacy notice aligned with data actually stored; admin contact-message deletion.
- CI runs regression tests before additive schema migration and deployment of both projects.

## Verification

`node --test tests/*.test.mjs` exercises real SQLite schema/queries with an in-memory R2 adapter. Covers draft isolation, direct-key access, session tampering, origin checks, rate limits, APK replacement, byte ranges, HEAD, counters, pagination, SQL parameters, legacy routes and error handling. It does not claim production stress-test results or independent penetration testing.

## Capacity and limits

10,000 simultaneous visitors is **not a verified capacity claim**. Static files use Pages distribution, but APIs and downloads execute Functions; cache hits still invoke Functions. The Workers Free plan documents 100,000 requests/day. D1 and R2 also have usage limits. The existing account plan and billing settings were not changed.

Catalog caching has a maximum 30-second propagation window after publication changes. Download authorization still checks publication directly. Media already downloaded or retained by a browser cannot be remotely revoked. Admin API responses remain no-store.

Before a large launch: run a staged load test on a non-production deployment with representative data and APK sizes; monitor p95 latency, error rate, D1 reads/writes and R2 operations. Set Cloudflare usage alerts. Heavy production downloads should use a dedicated delivery design/CDN domain with publication-aware access; do not simply expose the existing bucket, which contains drafts. This may require a paid plan/domain and is not activated here.

## Remaining operational considerations

- No malware scanning, signature trust service or legal certification is provided. Publish only apps you are authorized to distribute.
- Existing admin credentials were neither read nor changed. Real-owner login and publishing require the owner's credentials; automated tests use isolated fixtures.
- Successful APK replacements keep the previous object in private storage for recovery; implement a retention policy before many large releases. Abandoned *completed* uploads also need periodic inventory cleanup. Failed in-progress uploads are aborted by the client.
- Contact messages are retained until the administrator deletes them. Expired abuse counters are cleaned on subsequent protected requests. Configure provider-level log retention in Cloudflare as needed.
- Add stronger owner authentication (for example Cloudflare Access) before expanding publisher access. A hidden admin URL alone is not access control.

References: https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/r2/buckets/public-buckets/ ; https://developers.cloudflare.com/pages/functions/pricing/
