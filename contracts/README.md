# Contract examples, NOT final canonical Android schemas

The JSON Schema drafts in this folder are **design inputs** for Codex. Compare each field, naming convention, merge operation, timestamp representation and variant definition against actual Android model source and tests. Do not publish schemas as final just because they parse. Use Android `app/src/test/resources/parity/` fixtures and generate additional tests. The shared source-of-truth can live in Android until maintainers approve a shared contracts repo. Prefix IDs/versions as needed and keep compat aliases for existing backups.

Security note: a URL appearing in `playback-offer` does **not** entitle Anilife to relay its bytes. Approved playback policy and rights checks are separate, explicit requirements.
