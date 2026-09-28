# SourceSpec agent guidance

This is a private scratch repository for SourceSpec experiments, not an SDD-managed application or a chosen production home.

## Local workflow

- This repository overrides the workspace's default `develop` / work-branch and SDD delivery policy. Local app, schema, and documentation changes may be committed directly to `main` when Taylor explicitly asks for a commit. Do not commit automatically.
- Do not create branches, add remotes, push, merge, deploy, or release without separate explicit authorization.
- Preserve unrelated work. Inspect the staged diff before committing; exclude secrets, `.env*`, `node_modules/`, build output, and other local state.
- Verify changes proportionally. Keep experiments focused and do not add SDD configuration or dependencies unless explicitly requested.
- Use kebab-case for YAML filenames. App specs live under `.sourcespec/`: one file per flow in `flows/`, and function/test catalogs in `catalogs/`. Preserve schema-defined YAML field names.
