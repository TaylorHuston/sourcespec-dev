---
name: sspc-functions-catalog
description: Generate or check one application's complete SourceSpec function catalog from its TypeScript/JavaScript source, tests, and config. Never scan sibling apps or infer Requirement coverage from the inventory.
---

# SourceSpec function catalog

Work on one application-owned scope. Read its guidance, Git status, source, and existing catalog first. Install this skill's pinned dependencies once with `pnpm --dir <skill-dir> install --frozen-lockfile`. Resolve `scripts/functions-catalog.ts` and `assets/functions.schema.yaml` relative to this file, not the app.

```bash
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/app --probe
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/app --write
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/app --check
```

For a monorepo with a shared manifest/tsconfig, use `--project /absolute/path/to/repo --scope server` instead of `--app`; the scope owns the catalog and its `location` paths. Agree on scope ownership before generating. `--scope @root` inventories only direct repository-root tooling files, never sibling applications. Check `--probe`'s file counts, skipped directories, ownership classifications, and identity issues against representative source before writing.

The adapter inventories all owned function definitions, including callbacks in tests, tooling, and config. `sourceScope` describes the owning source, not whether a callable is a test declaration; tests have a separate catalog. Other languages need their own adapters. New IDs use `fn:<project-relative-file>#<lexical-owner-chain>`; normalized collisions and context-free anonymous functions receive visible UTF-16 range suffixes. Moves, renames, collisions, and range shifts can change IDs.

`--write` preserves reviewed descriptions, source scopes, and type notes **only when the existing lexical ID still matches the same declaration**. It refuses invalid catalogs, changed identities, and unmatched prior entries rather than pruning or transferring responsibility. Review source and authored links separately before resolving those cases; use a task-specific one-off script outside this skill if reconciliation is needed. Review the YAML diff and any `unclassified` scopes, then run `--check`. The check enforces a fresh complete inventory and one blank line between entries; neither catalog links nor a passing check prove behavior or test execution. Do not commit without authorization.

The bundled schema is a copy of SourceSpec's `schema/functions.yaml`; compare it when changing either. For skill changes run `pnpm --dir <skill-dir> typecheck` and `pnpm --dir <skill-dir> test`.
