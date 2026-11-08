# Release gates

Status at 2026-11-08. Preview: `https://anilife-web.adfreegames.workers.dev`.

| Gate | Status | Notes |
| --- | --- | --- |
| Hosted-derivative licence/rights verified | PENDING | Maintainer decision; no root licence is declared |
| Feature matrix with browser limitations | DONE | `PROVIDERS.md`, repository parity notes |
| Arbitrary URL proxy removed, SSRF fails closed | DONE | Smoke test and guard tests |
| Exposed credentials rotated | PENDING | The old AniList client secret must be revoked by its owner; it is removed from HEAD |
| No secrets in repo, bundle, logs | DONE | Public ids only; Worker secrets via Wrangler |
| No third-party stream relayed without rights | DONE | Embed-only playback; no relay exists |
| Source statuses reflect real evidence | DONE | Only Reanime promoted; others documented |
| Shared contracts tested both platforms | PARTIAL | TypeScript suite green; Android untouched by design |
| Backup wire v1 imports and round-trips | DONE | Android sealed-credential golden vector passes |
| Legacy localStorage migrated without loss | DONE | IndexedDB mirror/hydration tests; legacy keys retained |
| Android app id/signing unchanged | DONE | Android repository was not modified |
| AniList auth safe, exact callback | PARTIAL | Implicit flow implemented; callback must be registered per host |
| Production UI semantics and real URLs | DONE | Deep links, back/forward, keyboard focus ring |
| Browser player tested with authorised media | PARTIAL | Embed playback verified in Chromium; native HLS/MP4 untested |
| Privacy correct, diagnostics local, toggles OFF | DONE | `PRIVACY.md`, `SECURITY.md`, no upload endpoint |
| Preview isolation, noindex, no beta host | DONE | `X-Robots-Tag` on workers.dev; no beta subdomain |
| Build/deploy/rollback works | DONE | Wrangler deploy; rollback steps in `OPERATIONS.md` |
| Accessibility/performance review | DONE | Lighthouse 100 accessibility, 100 best practices, 100 SEO on the preview home |
| Manual approval before `anilife.cc` | PENDING | Not pointed at production |

## Known limitations

- Episode downloads are disabled by product decision.
- Embedded sources cannot report playback time; progress is manual.
- Only one provider is verified; most Android sources are blocked by headers, bot checks or
  datacenter-IP filtering.
- Native HLS/MP4 playback is implemented but has no verified source yet.
- AniList does not issue refresh tokens; reauthentication is expected.
