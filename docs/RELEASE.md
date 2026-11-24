# Release gates

Current Web release: **0.1.4** (2026-11-24). Production: `https://anilife.cc`.
Public `workers.dev` and preview URLs are disabled.

| Gate | Status | Evidence |
| --- | --- | --- |
| Rights and licence boundary | DONE | MIT-0 source; third-party metadata/artwork/media stay runtime references |
| Fixed-origin Worker and SSRF refusal | DONE | Guard tests and production smoke; no caller-supplied upstream URL |
| Secrets outside source/bundle/logs | DONE | Wrangler secrets; public build identifiers only |
| Verified metadata fallback | DONE | Signed/hashed Media Index release chain, IndexedDB last-known-good and rollback |
| Release and audio truth | DONE | Exact episode proof; Dub never forced on verified Sub-only titles |
| Browser provider eligibility | DONE | Four dated browser-verified sources; failed/unverified/adult-only candidates inactive |
| Stable anonymous source UI | DONE | Server 1-4, Zoko first, saved default preserved, bounded fallback |
| Profile/settings/data integrity | DONE | Visible-setting contract, backup/import, profile deletion and progress tests |
| Multilingual search and related manga | DONE | English/Romaji/native/aliases, verified manga relations and safe AniList links |
| Secure watch routes | DONE | Browser-bound authorization, copied/tampered denial and public share links |
| Anti-embedding and Discord isolation | DONE | Ordinary `frame-ancestors 'none'`/DENY; dedicated Activity exception |
| HTTP/error behavior | DONE | Real secured 404, JSON API errors, 405 `Allow`, typed retry/error UI |
| Signed Android/TV downloads | DONE | `/downloads`; exact stable 0.1.3 sequence-6 six-APK index |
| Cost boundary | DONE | Static assets bypass Worker; cached index; D1-enforced 75% R2 hard stop |
| CI and security review | DONE | CI, dependency review and both CodeQL gates passed on release PRs |
| Protected `main` | DONE | Active repository ruleset requires PRs, resolved threads and all hosted checks |
| Production deploy/rollback | DONE | Worker deployment/version history and `wrangler rollback` procedure |
| Real browser/device matrix | OWNER-RUN | Brave/phone/Safari/raw-player interaction is delegated to the owner |
| Zone WAF/rate-limit rule | DONE | Active 20 requests/10 seconds per-IP rule covers verification, watch-session and resolver APIs |

## Release procedure

1. Start from current `main` on a focused `sd/*` branch.
2. Run `npm run lint`, `npm test`, `npm run build`, Wrangler dry-run and local Worker smoke.
3. Open a focused PR; require CI, dependency review, CodeQL and zero actionable review threads.
4. Merge, rebuild the exact merge commit, deploy it, and run production smoke.
5. Verify `/downloads/index.json` remains JSON with the exact six signed artifacts.
6. Only then create the immutable tag and GitHub release. Roll back the Worker version on failure.

## Known limitations

- Playback depends on independent third-party providers and browser compatibility.
- Raw provider players can show their own ads or pop-ups; Anilife does not proxy or modify them.
- No adult-only candidate currently passes the complete browser eligibility contract, so none is
  enabled as filler. General eligible sources may still carry adult titles when the viewer permits it.
- Episode downloads are disabled. `/downloads` distributes signed Android/TV application packages.
- AniList does not issue refresh tokens; reauthentication is expected.
- Branded edge Custom Errors are not configured in the current deployment; failures outside Worker
  control may still use Cloudflare's default page.
