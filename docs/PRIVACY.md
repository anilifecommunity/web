# Privacy

Anilife Web is local-first. There is no Anilife account, no central user database and no
advertising or analytics service.

## Stored on your device

- Profiles (name, avatar, accent, optional PIN, kids mode)
- Settings and source preferences
- Library, watchlist, continue watching, watched marks and search history
- Local diagnostics (bounded, redacted error codes)

These live in `localStorage`, mirrored into IndexedDB so a cleared or evicted cache can be
recovered. The app requests persistent storage where the browser supports it. Export a backup
from Settings > Data if the data matters to you.

## Sent over the network

- **AniList** (`graphql.anilist.co`): public metadata, and your account data only after you sign
  in with your own token.
- **Anilife media index** (`cdn.jsdelivr.net`, `raw.githubusercontent.com`): static episode,
  backdrop and skip metadata.
- **AniSkip** (`api.aniskip.com`): public skip times.
- **Cloudflare Turnstile** (`challenges.cloudflare.com`): the first-visit bot check.
- **Reanime / Flixcloud** when you choose that source: the episode page and its player run in a
  cross-origin iframe under their own privacy terms.
- **Discord** only when you open Anilife as a Discord Activity: the Activity authorization code is
  exchanged by the Anilife Worker, which returns a short-lived access token. The token stays in
  memory, is used to verify your Discord account and set Rich Presence, and is never stored or
  logged. No message, friend or guild data is read.
- The Anilife Worker: provider-keyed metadata requests. It does not receive your AniList token.

Provider sites and CDNs are third parties with their own terms and privacy policies.

## Not collected

- No title, media URL, token, IP address, referer or profile identifier is written to diagnostics.
- No telemetry or diagnostic report is uploaded unless a future operator configures an endpoint
  and you turn the corresponding toggle on. Both toggles default to OFF.

## Retention and deletion

Local data stays until you clear it. Settings > Data can export or clear caches and diagnostics;
clearing site data removes profiles and history. Logging out of AniList removes the stored token
without deleting your local library.
