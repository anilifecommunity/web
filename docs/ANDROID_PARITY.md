# Android-to-Web parity

Android/TV is a read-only behavioral reference for shared Anilife concepts. Web keeps browser-native
navigation, accessible HTML, local-first storage and Cloudflare security; it does not copy Compose
layouts or Android-only device controls.

## Shared product contracts

| Contract | Web 0.1.4 behavior |
| --- | --- |
| Identity | AniList ID remains stable across routes, lists, progress, Media Index and manga relations. |
| Library | AniList list state and local playback history merge without regressing local progress; Continue Watching and Rewatching are first-class views. |
| Release truth | Only verified aired episodes are selectable; Media Index and bounded fixed-origin fallbacks distinguish released, not released and unavailable. |
| Progress | Partial episodes resume, completed episodes restart, durable writes are bounded, and AniList progress only advances monotonically. |
| Sources | Four browser-verified choices appear anonymously as Server 1-4. The saved default is attempted first; fallback is session-local. |
| Audio | A Dub preference is honored only when catalogue and provider evidence permit it; Sub-only titles fall back truthfully without rewriting the preference. |
| Adult filtering | Adult titles, artwork, search/schedule rows and adult-only source candidates are hidden by default and across profile boundaries. |
| Titles/search | Display language is English, Romaji or native; search always matches every title variant, synonyms and verified manga aliases. |
| Profiles | Local profiles retain isolated library/progress/search data, optional PIN guard and kids/adult behavior. |
| Backup | Portable viewer settings and local data use the compatible versioned backup mapping; device secrets remain local unless explicitly sealed. |
| Errors | Missing, unreleased, unavailable, expired, denied, rate-limited and provider failures remain distinct and recover without inventing success. |

Every visible Web setting has a runtime consumer and persistence/import path where promised. Android
settings with no meaningful browser equivalent are not exposed as decorative controls.

## Intentional platform differences

- `/downloads` distributes six signed Android/TV APKs. Web does not download episode media.
- Web has no Android DNS override, native decoder, TV launcher/overscan, background download,
  system notification scheduler, MAL device pairing or Discord desktop RPC.
- Browser notifications and new device-only settings are added only when they provide a real,
  permission-safe Web behavior; missing Android controls are not represented by placeholders.
- Provider names remain private in the Web UI even though engineering documents identify the
  integration. Raw cross-origin player controls remain provider-owned.
- Secure watch authorization, Turnstile, CSP and anti-framing are Web-only Worker responsibilities.

## Current source and metadata surface

- Provider candidates are reconciled in the private 82-row evidence matrix. Publicly selectable
  integrations are the four entries in [PROVIDERS.md](PROVIDERS.md); promotion requires current
  exact-title/episode/audio playback evidence.
- Public metadata uses AniList while healthy, then one verified immutable Media Index release, then
  browser last-known-good data. The index cannot authorize account mutations or bypass content rules.
- Adult-only candidates remain inactive because none currently satisfies the complete Web playback
  contract. Anilife does not bypass authentication, CAPTCHA, Cloudflare, DRM, framing or header policy.

## Verification boundary

Automated coverage includes storage/backup migrations, settings, list merging, release/audio truth,
metadata integrity, resolver/session security, route/status behavior and production smoke. The owner
performs the explicitly delegated Brave/phone/Safari and raw-player interaction matrix; a reported
failure reopens the relevant product slice.

See [PROVIDERS.md](PROVIDERS.md), [RELEASE.md](RELEASE.md), [SECURITY.md](SECURITY.md) and the
repository [changelog](../CHANGELOG.md) for current evidence and limitations.
