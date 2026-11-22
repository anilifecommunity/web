# Extensions on the web

`anilife-provider` v1 files in `extensions/packages/` run inside the Worker. A Worker can't block on the network, so
`worker/extensions/replay.ts` runs an extension, aborts it at the first unanswered request, fetches, and re-runs it with
earlier answers replayed.

## Build
1. `npm install`
2. `npm run ext:build` (needs network) and commit `worker/extensions/generated/`
3. `npm run lint && npm test`

To add one, drop its `.json` into `extensions/packages/`, rebuild, and check the host list the build prints; that list is the
network allowlist for the extension.

## Notes
- The registry in `src/resolver/registry.ts` still controls whether an id is attempted (`animepahe` is `native-only`; `megaplay` has no entry).
- Streams that need a `Referer` or other custom header are skipped.
- Extensions that put timestamps or randomness into their requests are rejected as non-deterministic.
- Cloudflare's Free plan allows 10 ms CPU per request, which replays may exceed.
