# Contract provenance

These schemas come from the 2026-11-08 Anilife Web Rewrite handoff pack
(`contracts/`), unmodified:

| File | Version | Purpose |
| --- | --- | --- |
| `playback-offer.v1.schema.json` | 1 | Normalized resolver output handed to the player |
| `provider.v1.schema.json` | 1 | Provider registry entry |
| `settings-portable.v1.schema.json` | 1 | Portable settings payload |

The TypeScript mirror lives in `src/resolver/types.ts`. `src/resolver/validate.ts` enforces the
playback schema at runtime; a schema change requires a version bump and mirrored fixture updates,
not an edit in place.

Android compatibility identifiers are protocol state: the backup wire format stays
`anilili-backup` v1 until a deliberate, tested bilateral migration exists.
