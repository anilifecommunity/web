# Cloud Sync

Anilife Cloud Sync is an opt-in, local-first account feature under staged development. Guest
profiles and all current local data continue to work without an Anilife account. The v1 protocol
and Worker sync engine are implemented; the Web client does not enable cloud writes until its
reconciliation UI and production gates are complete.

## Account boundary

- `/api/auth/*` is owned by Better Auth `1.7.27`, pinned exactly and backed by a dedicated D1
  database. It is not the Discord Activity token exchange.
- Discord is the initial account provider. Production requires `DISCORD_CLIENT_SECRET`; missing
  database or secret bindings return `503 cloud_auth_not_configured`.
- Sessions use a host-only secure HttpOnly cookie, `SameSite=Lax`, a 30-day lifetime and daily
  renewal. Better Auth enforces its Origin and CSRF checks against the exact configured origin.
- Provider access, refresh and ID tokens are removed by database hooks before account rows are
  written. They are used only during the OAuth request that proves the Discord identity.
- Authentication and future private API responses are `private, no-store` and retain the site's
  anti-framing and request-correlation headers.

## Storage boundary

`migrations/cloud-sync/` owns the isolated account/sync schema. It never shares the release-index
D1 database. The schema separates users/sessions, profiles, devices, current items, operation
receipts and the ordered change journal. Account deletion can cascade through every D1 row without
touching local guest data or the Android release index.

The Worker exposes the contract routes under `/api/v1/`. Account identity always comes from the
reviewed Better Auth session. Signed cursors and CSRF values use the independent
`SYNC_CURSOR_KEY`; D1 triggers apply mutation batches atomically, so a stale revision rejects the
complete batch.

The protocol accepts only the entity allowlist and bounded payloads defined in
`contracts/cloud-sync.v1.schema.json`. It never accepts an account ID from a client and never syncs
PINs, cookies, OAuth tokens, playback URLs, diagnostics or an arbitrary settings object.

## Deployment state

The schema and fail-closed auth route are deployed to the isolated staging Worker/database. The
staging Discord callback still requires a provider-issued credential and allowlisted redirect URI;
Anilife does not substitute a generated or public fake secret. Production activation occurs only
after the focused PR passes hosted checks, production migrations have a Time Travel bookmark, and
the existing production Discord secret is available in the same Worker.

The sync data routes are deployed for authenticated contract clients. The Web client opt-in remains
disabled until its own reviewed slice lands; backend availability is not represented to users as a
completed cloud backup.
