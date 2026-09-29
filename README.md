# SourceSpec

This is a private playground for experimenting with SourceSpec. Initial work targets TypeScript/React apps while exploring a format that could work across languages and frameworks. This repo is not a commitment to a production or deployment home.

- `schema/` - Early drafts of schemas for SourceSpec's concepts.
- `example-apps/example-todo/` - A local SQLite-backed Vite/React todo app with account-scoped tasks, an `openapi.yaml` HTTP contract, tests, a complete generated function inventory, and hand-authored behavior, HTTP operation, data-model, and test records under `.sourcespec/`.

YAML filenames use kebab-case (for example, `functions-catalog.yaml`, `tests-catalog.yaml`, `local-http.yaml`, and `add-task.yaml`); schema-defined field names keep their existing casing.

## Working here

SourceSpec is a scratch project, not an SDD-managed workspace application. Its local workflow deliberately overrides the workspace's default `develop` / work-branch policy: when Taylor requests a commit, experimental app code, schemas, and documentation may be committed directly to `main`. Commits are not automatic; creating branches or publishing/pushing the repository requires separate explicit authorization. See `AGENTS.md` for the local guidance and safety rules.
