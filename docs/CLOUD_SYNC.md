# Cloud Sync

Anilife Cloud Sync is an opt-in, local-first account feature. Guest profiles and all current local
data continue to work without an Anilife account. The Web client enables cloud writes only after a
Discord sign-in, a remote-data preview and an explicit non-destructive merge choice.

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

The sync data routes are deployed for authenticated contract clients. The Web client keeps a
durable account-partitioned IndexedDB journal, batches ordinary edits, preserves failed operations,
and exposes manual sync, disconnect, device revocation, portable export and remote deletion under
Settings → Accounts & Sync. Profile PINs, provider choices, credentials and diagnostics remain
local.

## Recovery boundary

D1 remains the primary sync store. After a real change, the Worker may replace one private recovery
object for that account no more than weekly; failed attempts are limited to once daily. The object
name is an HMAC-derived server value, the bucket has no public URL or custom domain, and account
deletion removes the object before deleting D1 state. Snapshots are capped at 1 MiB and carry a
SHA-256 integrity value. They are encrypted in transit and by Cloudflare at rest, but are not
end-to-end encrypted; only a separately user-passphrase-sealed export could make that claim.

The emergency `CLOUD_SYNC_WRITES_ENABLED` switch rejects new mutations with a retry window while
bootstrap/export remain available. Web clients retain the durable local outbox and do not report
those writes as synced.
