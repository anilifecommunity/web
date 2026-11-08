# Security

## Reporting

Use GitHub's **private vulnerability reporting** on this repository when it is enabled
(Settings > Code security and analysis). Until then, contact the maintainer privately through
their GitHub profile; do not open a public issue with exploit details.

Include the affected route or file, browser, impact and a minimal reproduction. Never include
tokens, cookies, passwords or personal data in a report.

We aim to acknowledge a report within 3 business days, complete an initial assessment within 10
business days, and coordinate disclosure after a fix or mitigation exists. This is a volunteer
open-source project; there is no bug bounty.

## Out of scope

- Vulnerabilities in third-party provider sites, players or CDNs. Report those to the provider.
- Content rights or takedown requests. Contact the maintainer privately.
- Issues that require modifying the Android app; that repository has its own policy.
- Reports from scanning a preview deployment that do not reproduce on `anilife.cc`.

## Model

- The Worker accepts **provider ids**, never destinations. There is no `?url=` or `?referer=`
  parameter and no generic proxy.
- Every upstream request uses a fixed HTTPS origin, manual redirects with per-hop validation,
  private-address refusal, a byte ceiling and a timeout.
- Resolver responses are validated against the playback contract before the player sees them.
  Stream and subtitle URLs must be HTTPS; unknown fields are rejected.
- The first-visit gate uses Cloudflare Turnstile, a signed HttpOnly cookie and a per-IP limit.
  `/api/resolve` requires the cookie when the gate is configured. A Discord Activity may instead
  present the same signed gate token in `X-Anilife-Gate` after the Worker verifies its Discord
  access token. Deployments carry `APP_ENV=production`; without both gate secrets the resolve API
  fails closed with 503 instead of serving unprotected. Local and CI runs override `APP_ENV=test`.
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
  `X-Frame-Options: DENY` are applied to every response. Preview hosts are `noindex`.
- Provider media plays in a cross-origin iframe. The app does not host, proxy or expose a
  downloadable episode URL, and episode downloads are disabled by product decision.
- Discord Rich Presence uses the official Embedded App SDK only inside a Discord Activity. The
  authorization code is exchanged by the Worker with a Wrangler secret when configured, or with a
  PKCE verifier for a Public Client; the client never receives a secret. `frame-ancestors` allows
  only Anilife, `discord.com` and `*.discordsays.com`. See [DISCORD.md](DISCORD.md).

## Secrets

- No secret belongs in source, the bundle, `VITE_*`, Git history, an issue or a log.
- AniList uses the public implicit flow; there is no client secret.
- Runtime secrets are Wrangler secrets: `TURNSTILE_SECRET` and `GATE_SIGNING_KEY`.
- The historical AniList client secret that shipped in the old web source was revoked by the
  application owner on 2026-11-08. Removing a secret from HEAD is not a rotation; revoke it at the
  provider first, then remove it from history if appropriate.

## Tokens

AniList access tokens are stored in the browser only for the signed-in viewer, sent directly to
`graphql.anilist.co`, and cleared on logout. They are never written to diagnostics, logs, backup
files or the Worker.

## Diagnostics

Local diagnostics are bounded and redacted: URLs, tokens, passwords, cookies, titles and
identifiers are dropped. Upload toggles default to OFF and no upload endpoint is called.

## Continuous security

CodeQL, dependency review, Dependabot and the repository settings checklist are documented in
[CI_SECURITY.md](CI_SECURITY.md). Automated scanning does not replace the manual review checklist
there, especially for the Worker allowlists, Turnstile gate, iframe embeds, OAuth token handling
and local profile storage.
