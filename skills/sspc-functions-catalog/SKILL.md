---
name: sspc-functions-catalog
description: Generate or check one application's complete SourceSpec function catalog from its TypeScript/JavaScript source, tests, and config. Never scan sibling apps or infer Requirement coverage from the inventory.
---

# SourceSpec function catalog

Read the app's guidance, Git status, source, and existing catalog. Choose one owned scope; do not scan sibling apps. Use the user-installed CLI (installation and source: `spaces/sourcespec/cli/README.md`):

```bash
~/.sourcespec/bin/sourcespec sspc-functions probe --app /absolute/path/to/app
~/.sourcespec/bin/sourcespec sspc-functions write --app /absolute/path/to/app
~/.sourcespec/bin/sourcespec sspc-functions check --app /absolute/path/to/app
```

The CLI reads shared schemas installed at `~/.sourcespec/schema/`; install the CLI before use. For a monorepo with one shared TypeScript config, replace `--app` with `--project /absolute/path/to/repo --scope server`; `--scope @root` includes only direct root tooling. Inspect probe counts, skipped files, ownership, and identity issues against source before writing.

The CLI inventories all owned function definitions, including callbacks in tests and config. It emits readable `fn:<project-relative-file>#<lexical-owner-chain>` IDs; collisions and context-free callbacks get position-dependent UTF-16 suffixes. Review new IDs, changed ranges, `unclassified` source scopes, type notes, and the YAML diff. A move, rename, or collision needs separate review of curated links; normal writes fail closed rather than transferring them. Only with explicit approval to discard the old catalog, use `sspc-functions write --app /absolute/path/to/app --force`: it atomically replaces the catalog, losing curated metadata and old IDs. Back up the file and review links and the regenerated inventory first. Run `check` after review. Neither catalog links nor a passing check prove behavior or test execution. Do not commit without authorization.
