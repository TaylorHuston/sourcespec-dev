# SourceSpec agent guidance

This is a private scratch repository for SourceSpec experiments, not an SDD-managed application or a chosen production home.

## Local workflow

- This repository overrides the workspace's default `develop` / work-branch and SDD delivery policy. Local app, schema, and documentation changes may be committed directly to `main` when Taylor explicitly asks for a commit. Do not commit automatically.
- Do not create branches, add remotes, push, merge, deploy, or release without separate explicit authorization.
- Preserve unrelated work. Inspect the staged diff before committing; exclude secrets, `.env*`, `node_modules/`, build output, and other local state.
- Verify changes proportionally. Keep experiments focused and do not add SDD configuration or dependencies unless explicitly requested.
- Use kebab-case for YAML filenames. App specs live under `.sourcespec/`: one file per behavior in `behaviors/`, and function/test catalogs in `catalogs/`. Preserve schema-defined YAML field names.
- Behaviors define conditions and intended outcomes, with curated `implementedBy` and `verifiedBy` links; they do not prescribe execution order or claim an exhaustive call trace. Leave `supportedBy` out until it has a distinct, agreed meaning.
- Keep an app's HTTP contract at its root as `openapi.yaml`; do not duplicate request/response contracts in SourceSpec. An operation-to-handler map remains future work.
- The function catalog must include every function defined in the example app's own runtime, config, and test source, including anonymous callbacks and constructors. Run `npm run catalog:refresh` after code edits and `npm run catalog:check` before claiming completeness; review unmatched IDs instead of silently replacing them after moves or renames. Catalog `location` is a file path and `context` is a searchable hint, never a line/offset; external dependencies and the repository-level generator are outside the app boundary.
