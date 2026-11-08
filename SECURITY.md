# Security

## Reporting

Report a vulnerability privately to the maintainers; do not open a public issue with exploit
details. Include the route, browser, and a minimal reproduction. Never include tokens, cookies or
personal data in a report.

## Model

- The Worker accepts **provider ids**, never destinations. There is no `?url=` or `?referer=`
  parameter and no generic proxy.
- Every upstream request uses a fixed HTTPS origin, manual redirects with per-hop validation,
  private-address refusal, a byte ceiling and a timeout.
- Resolver responses are validated against the playback contract before the player sees them.
  Stream and subtitle URLs must be HTTPS; unknown fields are rejected.
- The first-visit gate uses Cloudflare Turnstile, a signed HttpOnly cookie and a per-IP limit.
  `/api/resolve` requires the cookie when the gate is configured.
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
  `X-Frame-Options: DENY` are applied to every response. Preview hosts are `noindex`.
- Provider media plays in a cross-origin iframe. The app does not host, proxy or expose a
  downloadable episode URL, and episode downloads are disabled by product decision.

## Secrets

- No secret belongs in source, the bundle, `VITE_*`, Git history, an issue or a log.
- AniList uses the public implicit flow; there is no client secret.
- Runtime secrets are Wrangler secrets: `TURNSTILE_SECRET` and `GATE_SIGNING_KEY`.
- The historical AniList client secret that shipped in the old web source must be revoked at
  AniList by the application owner. Removing it from HEAD is not a rotation.

## Tokens

AniList access tokens are stored in the browser only for the signed-in viewer, sent directly to
`graphql.anilist.co`, and cleared on logout. They are never written to diagnostics, logs, backup
files or the Worker.

## Diagnostics

Local diagnostics are bounded and redacted: URLs, tokens, passwords, cookies, titles and
identifiers are dropped. Upload toggles default to OFF and no upload endpoint is called.
