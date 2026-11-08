# Android → Web parity plan

Source of truth: `C:\Users\User\Documents\ChatGPT\anilili-android-and-tv`
(reference only; never modified). Extracted 2026-11-08 from:
`ProviderCatalog.kt`, `data/settings/SettingsStore.kt`, `data/library/*.kt`,
`data/backup/*.kt`, `docs/ERROR_CODES.md`, `docs/OWNERSHIP.md`, `ui/watch/*`,
`diagnostics/*`, `playback/*`.

Vocabulary: `done`, `partial`, `browser-limited`, `rights-pending`, `blocked`, `todo`.

## 1. Provider surface - 42 servers

Android order = `defaultPriority` + (miruroOrder + anivexaProviders) minus leaders.
Adult servers are hidden when the viewer hides adult content. `xfdm` is intentionally absent
from web (its only web path was the removed lili archive), leaving 42.

| # | ID | Label | Backend | Keying / protocol | Web plan |
|---|---|---|---|---|---|
| 1 | bee | Bee | Miruro pipe | anilist → pipe → native HLS | blocked: pipe refuses datacenter IPs, no CORS |
| 2 | sun | Sun | Miruro pipe | native HLS (icarus) | blocked |
| 3 | pewe | Pewe | Miruro pipe | native HLS | blocked |
| 4 | hop | Hop | Miruro pipe | native HLS | blocked |
| 5 | ally | Ally | Miruro pipe | native HLS | blocked |
| 6 | kiwi | Kiwi | Miruro pipe | HLS w/ custom AES-128 IV | blocked |
| 7 | moo | Moo | Miruro pipe | native HLS | blocked |
| 8 | bonk | Bonk | Miruro pipe | soft/hard sub, HLS | blocked |
| 9 | knob | Knob | Miruro pipe | native HLS (aniwaves) | blocked |
| 10 | nun | Nun | Miruro pipe | iframe embed (parent ally) | todo: iframe only if embed URL is reachable |
| 11 | bun | Bun | Miruro pipe | iframe embed (parent bee) | todo: same |
| 12 | cog | Cog | Miruro pipe | iframe embed (parent moo) | todo: same |
| 13 | twin | Twin | Miruro pipe | embed resolvable to HLS | blocked: needs pipe |
| 14 | telli | Telli | Miruro pipe | iframe, upstream-hidden | todo: only if reachable |
| 15 | anipm | Ani.pm | Anivexa | JSON, AniList id, 4-hop session | partial: Cloudflare TLS gate rejects non-browser clients |
| 16 | anichan | AniChan | Anivexa | JSON, AniList id + session cookie | done: adapter; upstream returns empty servers |
| 17 | zoko | Zoko | Anivexa | HTML XOR (MAL id), Referer-gated HLS | blocked: browser cannot send Referer |
| 18 | animepahe | AnimePahe | Anivexa | WebView resolver | blocked: native-only |
| 19 | rareanimes | RareAnimes | Anivexa | HTML search + server pages | todo: worker probe |
| 20 | anidbapp | AniDB App | Anivexa | site search + `play.anidb.app` JSON, header-free HLS | todo: high value (HLS header-free) |
| 21 | animeheaven | AnimeHeaven | Anivexa | HTML 3-hop, progressive MP4, header-free | blocked by egress filtering (code kept) |
| 22 | animeonsen | AnimeOnsen | Anivexa | JSON only, no HTML parse | todo: high value |
| 23 | anikoto | Anikoto | Anivexa/MegaPlay | embed + encrypted `getSources`, Referer-gated | blocked: header-gated |
| 24 | kaa | KickAssAnime | Anivexa | JSON/HTML API | todo |
| 25 | allanime | MKissa (AllAnime) | Anivexa | CAPTCHA + proof-of-work + JS unpacker | blocked: anti-bot |
| 26 | animekai | AnimeKai | Anivexa | HTML/JSON | todo |
| 27 | reanime | Reanime | Anivexa | `reanime.to/api/v1/search` + flixcloud | todo: WebView/JSON |
| 28 | anizone | Anizone | Anivexa | HTML slug page | todo |
| 29 | animegg | AnimeGG | Anivexa | HTML series page | todo |
| 30 | anineko | Anineko | Anivexa | HTML watch page | todo |
| 31 | 2dhive | 2Dhive | Anivexa | Astro props + MegaPlay | blocked: header-gated |
| 32 | animedekho | AnimeDekho | Anivexa | JSON catalogue + Wikipedia-like data | todo |
| 33 | toonhub | ToonHub4u | Anivexa | WordPress REST search + post links | next: iframe candidate |
| 34 | uniquestream | UniqueStream | Anivexa | HTML + keyed segments | todo |
| 35 | animekhor | AnimeKhor | Anivexa | CN-only HTML | todo: region-locked |
| 36 | kartoons | Kartoons (Hindi) | Anivexa | JSON catalogue + account token pool | rights/token pending |
| 37 | animeav1 | AnimeAV1 (Espanol) | Anivexa | Spanish HTML | todo |
| 38 | rift | AnimeRift (Arabic) | Anivexa | Firebase + JSON | todo |
| 39 | hanime | Hanime | Anivexa | WebView, adult | blocked: native-only + adult |
| 40 | hentaihaven | Hentai Haven | Anivexa | HTML, adult | todo: adult-gated |
| 41 | hstream | HStream | Anivexa | sitemap + player API, header-free DASH, adult | todo |
| 42 | onepace | One Pace | one-off | title-bound, pixeldrain | todo: title-specific |

Shared provider rules to mirror:
- user-pinned provider first; configured priority; explicit fallback only.
- variant order from `ProviderCatalog` (soft/hard sub per provider).
- declared languages: AnimeAV1 Spanish, Kartoons Hindi, AnimeRift Arabic.
- adult set: hanime, hentaihaven, hstream; hidden when hide-adult is on.
- short-lived URLs: kartoons (re-resolve same provider before switching).
- no invented success: a source is only "working" with dated playback evidence.

## 2. Settings surface

Android stores 109 keys in DataStore (`SettingsStore.kt`). Web equivalents:

| Group | Keys (Android) | Web state |
|---|---|---|
| Playback | autoplay, play_on_open, picture_in_picture, pause_details_overlay, auto_skip_intro_outro, auto_skip_filler, show_skip_button, skip_button_seconds, watched_threshold_percent, default_playback_speed, hold_to_speed_enabled, hold_playback_speed | partial |
| Audio/subtitles | prefer_dub, preferred_audio_language, preferred_subtitle_language, secondary_audio_language, secondary_subtitle_language, subtitles_with_dub, subtitle_signs_with_dialogue, subtitles_by_default, subtitle_search_languages | partial |
| Captions | caption background opacity/color, text scale/opacity/color, bold, font, edge margin/style, horizontal anchor, position, persistent delays | todo (video::cue styles) |
| Sources | preferred_provider, server_priority, disabled_providers, preferred_source_languages, hide_adult_content | done in resolver; settings UI partial |
| Appearance | theme background/accent/style/contrast, custom seed, colour pages, app backdrop source/url/title/image/dim/blur, static_app_chrome, glass_* sections, app_icon_matches_theme, ui_scale, player_content_scale, tv_overscan | partial |
| Layout | home_layout, home_tab, episode_layout, episode_order, related_layout, episode_drawer_layout, browse_header_collapsed, browse_hide_watched, search_as_you_type | partial |
| Content | hide_adult_content, blur_episode_images, hide_airing_tomorrow_from_continue, show_series_logos, hidden_mal_tags, hidden_poster_elements | todo |
| Accounts | auto_sync_anilist, sync_saved_to_anilist, discord_rich_presence, discord_status | partial (AniList; Discord browser-limited) |
| Notifications | release_notifications, announcements | todo (web notifications opt-in) |
| Diagnostics | diagnostic_detail, two upload toggles (default OFF), update_check_on_launch, receive_beta_updates | todo |
| Downloads | download_quality, download_destination, download_hard_subs_only | disabled by product decision: no episode download UI, embed-only playback |
| Device | doh_provider, form_factor_preference, app_layout_mode, tv_double_back_to_exit, clock_format, menu_language, leanback_launcher_seen | browser-limited/none |
| Migration | migrated_from_shared_preferences | replaced by IndexedDB migration receipt |

Portable settings (backup/settings-portable.v1) keep only viewer preferences; device/secret keys
stay local.

## 3. Library, history, lists

`LibraryModels.kt`:
- `HistoryEntry`: anilistId, title, cover, episodeNumber (Double), episodeTitle, provider,
  category, positionMs, durationMs, updatedAt, watchedEpisodes set, fromRemote, resumePoints
  (max 24, partial episodes only).
- Resume rule: a watched episode restarts; partial episodes resume per-episode.
- `watchlist`, `customLists`, `watched` (WatchedEntry), `searchHistory`.
- Watched threshold percent drives completion and AniList progress sync.
- `AUTO_PROVIDER = "auto"` until a server is picked.

Web target: same fields inside IndexedDB `history`, `progress`, `watchlist`, `custom_lists`,
`search_history`; episode numbers as strings preserving "7.5".

## 4. Backup wire format (must stay compatible)

`AppBackup.kt`: `format = "anilili-backup"`, `version = 1`, fields:
`createdAt`, `appVersion`, `settings`, `watchlist`, `history`, `searchHistory`,
`customLists`, `watched`, optional `credentials`.

`BackupCrypto.kt`: PBKDF2-HMAC-SHA256, 210,000 iterations, 16-byte salt, AES-GCM 12-byte IV,
128-bit tag; AAD = `"$format/$version"`; ciphertext base64. Use Web Crypto only, with golden
vectors; never hand-roll AES.

Credentials in v1: AniList token, OpenSubtitles user/pass, MAL OAuth handoff (code+verifier).
MAL refresh tokens must never be copied between devices. Web export never includes credentials
unless the viewer asks and supplies a passphrase.

## 5. Player semantics

- HLS via hls.js when native HLS is missing; MP4/DASH capability detection.
- Quality ladder, audio track, soft/hard subtitle distinction, subtitle delay, caption styling.
- Skip windows: intro/outro/recap/filler; auto-skip toggles; skip button countdown.
- Resume + watched threshold; progress sync; auto-play next.
- PiP, fullscreen, keyboard/TV remote, gestures, hold-to-speed, sleep timer.
- Errors use the Android catalogue codes (NET/SRC/PLAY/SUB/DL/ACC/BAK).
- Browser limitations labelled: no Android DNS, no native decoder, no background download,
  no Discord RPC, no casting.

## 6. Profiles, navigation, diagnostics

- Local profiles with name, avatar, accent, optional PIN, kids mode; profile switch keeps library.
- Routes Android exposes: home, search, schedule, library, downloads, detail, watch, settings,
  notifications, profiles, pairing, random, announce.
- Web routes target: `/`, `/discover`, `/anime/:id`, `/anime/:id/watch/:episode`, `/schedule`,
  `/library`, `/settings`, `/settings/sources`, `/profiles`. Stale `/downloads` links redirect home.
- Diagnostics: bounded redacted events, local export, two upload toggles OFF by default; no
  title/stream URL/token/IP in reports.
- Notifications: browser Notification API + opt-in; scheduled airing checks are best-effort.
- Downloads: intentionally removed. The web client offers no episode download action and playback is embed-only, so no media URL is exposed for saving.
- Pairing: not applicable to web; omit with an explanation.

## 7. Execution order for web

1. UI polish: custom scrollbar, smooth scrolling, focus rings (no redesign).
2. Phase 5: IndexedDB v1 + localStorage migration + backup v1 + settings portability.
3. Phase 6: URL router, PWA manifest/service worker, parity settings subsets, branding.
4. Phase 7: CSP/headers, diagnostics with consent, Playwright E2E, deploy + release gates.
5. Providers: ToonHub iframe first (working playback candidate), then adapters in value order:
   AniDB App, AnimeOnsen, Reanime, AnimeKai, RareAnimes, KAA, ToonHub native, HStream (adult),
   then remaining Anivexa. Each needs dated evidence in `.private/PROVIDER_MATRIX.md`.
   Miruro/Zoko/AllAnime stay unavailable unless a residential egress or approved relay exists.


