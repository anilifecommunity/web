# Web provider matrix

State vocabulary: `browser-direct`, `worker-metadata-only`, `iframe`, `native-only`,
`permission-pending`, `unavailable`, `unverified`.

A provider is only `browser-direct` or `worker-metadata-only` after a dated browser test of the
manifest, a variant playlist and a segment with seek. A metadata JSON that returns 200 is not
playback evidence.

| Provider | Catalogue | Web state | Rights | Evidence |
| --- | --- | --- | --- | --- |
| anichan | anivexa | worker-metadata-only | unknown | 2026-11-08: `/api/watch/episodes` answers, but `/api/watch/servers` returns `{"servers":[]}` for AniList 21, 154587, 16498 and 52991 with or without a session cookie. Adapter is implemented and reachable; upstream currently yields `no_streams`. |
| animeheaven | anivexa | worker-metadata-only | unknown | 2026-11-08: `search.php` -> `anime.php` -> `gate.php` returns progressive MP4. `ax.animeheaven.me` answered `206` with `Accept-Ranges: bytes` and no Referer. Sub-only, burned-in subtitles. Adapter implemented; browser `<video>` playback pending a real browser check. |
| zoko | anivexa | unavailable | unknown | Master, variant and segment all require `Referer: https://zokoanime.video/`; a browser cannot send it. Would need a relay, which is not approved. |
| bee, sun, pewe, hop, ally, kiwi, moo, bonk, knob | miruro | unavailable | pending | Miruro pipe refuses datacenter IPs (`docs/PIPE_PROTOCOL.md` in the Android repo) and sends no CORS headers. Neither a Worker nor the browser can read it. |
| nun, bun, cog, twin, telli | miruro | unverified | pending | Iframe embeds. Only worth using if the embed URL can be obtained without the pipe and the iframe actually plays. |
| reanime | anivexa | worker-metadata-only (iframe) | unknown | 2026-11-08: `/api/flix/{anilistId}/{episode}` names a Flixcloud embed per audio track; the embed loads and plays in Chromium with no X-Frame-Options or frame-ancestors. Working end to end through the Worker. Iframe playback, manual progress. |
| animepahe, hanime, hentaihaven, allanime | anivexa | native-only | unknown | WebView resolvers, CAPTCHA/PoW, or both. Not browser-capable without bypassing protections. |
| anipm, rareanimes, anidbapp, animeonsen, anikoto, kaa, animekai, anizone, animegg, anineko, 2dhive, animedekho, toonhub, uniquestream, animekhor, kartoons, animeav1, rift, hstream, onepace | mixed | unverified | unknown | No dated browser evidence. Do not promote in the picker until measured. |

## Rules

- Every row must carry a date, a browser and the test performed before its state changes.
- `permission-pending` is not a soft yes. It means the source must not be offered.
- Never add a provider to the Worker adapter map without a matching row here.
- Re-test at each release and when a provider changes its catalogue shape.
