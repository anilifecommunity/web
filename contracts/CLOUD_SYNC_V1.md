# Anilife Cloud Sync v1 contract

Status: published protocol contract only. No production endpoint or account system exists until the
backend and deployment slices pass their own gates.

## Local-first boundary

Cloud Sync is opt-in. Guest profiles, local history and playback continue without an Anilife
account. A client saves locally and durably records an operation before attempting a sync. It
advances its cursor only after applying a complete response transaction. A failed, conflicted,
expired or rate-limited request never deletes the outbox.

The server derives the account from a reviewed session. It never accepts an account ID from a path,
query or request body. Every response containing private data is `Cache-Control: private, no-store`.
Mutations require the session cookie, a session-bound CSRF header and an exact allowed Origin.

## Limits

- Request body: 128 KiB.
- Operations per sync: 50.
- One operation after JSON encoding: 10 KiB.
- Changes per response page: 250.
- Response target: 256 KiB.
- Unknown fields and unsupported protocol versions are rejected.

These are Anilife protocol limits, not claims about Cloudflare quotas.

## Entity allowlist

Only `profile`, `portable_setting`, `watchlist`, `watched_episode`,
`continue_progress` and `linked_identity_metadata` are accepted. Their values are fully typed in
`cloud-sync.v1.schema.json`. Profile PINs, passwords, cookies, OAuth credentials, provider tokens,
playback URLs, diagnostics and arbitrary settings blobs are never sync entities.

The v1 portable setting keys are deliberately smaller than the Web settings object. Provider
selection, source capability state, device paths, browser permissions and other platform-specific
values stay local.

## Media identity

The canonical key is the released Media Index key `al-{AniList ID}`. `kind` is independently
required because AniList anime and manga IDs occupy different namespaces. The `aliases.anilist`
value must equal the numeric suffix in `mediaKey`; a supplied MAL alias is accepted only after a
verified mapping. Unknown mappings remain unresolved. Clients and servers never merge by title.

Legacy local rows containing only an AniList ID may be upgraded to `al-{id}` with their known
kind. A row without a known kind is quarantined until resolved; it is not guessed or uploaded.

## Concurrency

`opId` is stable across retries. `baseRevision` is checked by a database-level conditional
write in the same transaction as the item, change journal and operation receipt. Any stale
operation rejects the entire batch with `409 revision_conflict`; a dropped edit is never reported
as acknowledged. Deletes produce revisioned tombstones.

An expired change cursor returns `410 cursor_expired`. The client performs a paged bootstrap while
preserving its outbox. `429` requires `Retry-After`; invalid/auth/conflict failures are not
blindly retried.

## Contract files

- `cloud-sync.v1.openapi.json`: endpoint and HTTP behavior.
- `cloud-sync.v1.schema.json`: shared JSON Schema definitions.
- `fixtures/cloud-sync/v1/`: deterministic valid examples.
- `android/anilife-cloud-sync-v1.bundle.json`: generated, hash-addressed Android handoff bundle.
