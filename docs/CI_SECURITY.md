# CI and GitHub security

Status as of 2026-11-08. "Configured in Git" means the repository file exists. "GitHub setting"
means a repository setting outside Git. "Verified" means checked through the GitHub API.

## Workflow matrix

| Workflow | Triggers | Job / expected check |
| --- | --- | --- |
| `CI` | PRs to `main`, pushes to `main`, manual | `Lint, test, build and smoke` |
| `CodeQL` | PRs to `main`, pushes to `main`, weekly Monday 03:17 UTC, manual | `Analyze javascript-typescript` |
| `Dependency review` | PRs to `main` | `Dependency review` |

CI runs `npm ci`, `npm run lint`, `npm test`, `npm run build`, validates the build output and starts
a local Wrangler instance for a deterministic smoke test. The smoke request uses an unavailable
provider id, so CI never depends on provider networks, public production or secrets. The local
instance is started with `APP_ENV:test`; deployed Workers carry `APP_ENV=production` from
`wrangler.jsonc`, so a production build without both gate secrets refuses `/api/resolve` with 503.

Pinned actions:

| Action | Version | Commit SHA |
| --- | --- | --- |
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v6.5.0 | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| `github/codeql-action` | v4.39.3 | `33d7b85da1a04171e211befe2c739303b9a4c066` |
| `actions/dependency-review-action` | v5.0.0 | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` |

Node 24 matches the local toolchain and Vite 8's supported range.

## Feature status

| Feature | Configured in Git | GitHub setting | Verified live | Owner action |
| --- | --- | --- | --- | --- |
| CI (lint/test/build/smoke) | Yes | Not applicable | Yes, `main` run passed | None |
| Advanced CodeQL | Yes | Default setup not configured | Yes, `main` run passed | Keep default setup off |
| Dependabot config | Yes | Not applicable | Yes, update PRs opened | None |
| Dependency graph | No file needed | Enabled | Yes, SBOM lists 213 packages | None |
| Dependency review | Yes (workflow) | Not applicable | Yes, passes when a PR changes dependencies | None |
| Dependabot alerts | No file needed | Enabled | Yes (204) | None |
| Dependabot security updates | No file needed | Enabled | Yes | None |
| Code scanning | Yes (workflow) | Default setup not configured | Yes, 0 open alerts; 5 dismissed with reasons | None |
| Secret scanning | No file needed | Enabled | Yes | None |
| Secret scanning push protection | No file needed | Enabled | Yes | None |
| Private vulnerability reporting | No file needed | Enabled | Yes | None |
| Ruleset for `main` | Template only | No rulesets | Yes | Import template |
| Branch protection | Not used | Not protected | Yes | Use a ruleset |
| Actions default token | Not applicable | Read-only | Yes | None |
| Require SHA-pinned actions | Not applicable | Enabled | Yes | None |
| Production environment | Not used | No environments | Yes | Optional |

## Owner actions

Security settings are complete and verified. Dependency graph is enabled, so Dependency review
now runs on dependency PRs. Open `https://github.com/anilifecommunity/web/settings/security_analysis`
only if a future audit needs to confirm:

1. **Dependency graph** - on. Verified with a 213-package SBOM on 2026-11-08.
2. **Code scanning** - default setup **off**. The advanced workflow owns CodeQL.
3. Dependabot alerts, Dependabot security updates, secret scanning, push protection and private
   vulnerability reporting stay on.

Open `https://github.com/anilifecommunity/web/settings/rules`:

1. New ruleset, target `main`, import `docs/ruleset-main.json` (or POST it with
   `gh api repos/anilifecommunity/web/rulesets -X POST --input docs/ruleset-main.json`).
2. Confirm the required check names after the first CI, CodeQL and dependency-review runs. The
   template uses the job names `Lint, test, build and smoke`, `Analyze javascript-typescript` and
   `Dependency review`.
3. Add yourself as a bypass actor if you work alone, or raise approvals to one once a second
   maintainer exists.

Optional: create a `production` environment with required reviewers before any deployment workflow
is added. Production deployment is currently manual Wrangler and is not part of CI.

For alerts, use **Watch > Custom > Security alerts**. Do not add a third-party security bot.

## Validation performed

- `npm ci` on Node 24: pass.
- `npm run lint`: pass (app and Worker TypeScript).
- `npm test`: 59 tests pass.
- `npm run build`: pass.
- Local Wrangler smoke: all checks pass with the gate disabled, using an unavailable provider.
- Workflow YAML parsed successfully.
- Action SHAs resolved with `git ls-remote` against each action repository.
- CI and advanced CodeQL pass on `main`; CodeQL published 16 findings on the first scan, 11 were
  fixed, and 5 were dismissed with written reasons (four image-src false positives after
  `safeImageUrl` validation, one stale randomness location).
- Dependabot opened grouped minor/patch and separate major PRs. CI, CodeQL and Dependency review
  pass; all five were reviewed and merged on 2026-11-08.

The GitHub-hosted workflows cannot be executed locally; their first real result appears in the
Actions tab after the next push.

## Manual review checklist

CodeQL does not replace review of:

- Worker host allowlists, redirect validation, response-size and timeout limits.
- Turnstile gate cookie signing, expiry and rate limits.
- Untrusted provider embed URLs and iframe permissions.
- AniList token storage, logout clearing and no token in logs or backups.
- IndexedDB/localStorage migration and per-profile separation.
- No media download path and no generic media relay.
