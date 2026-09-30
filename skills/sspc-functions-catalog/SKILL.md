---
name: sspc-functions-catalog
description: Generate or update one application's complete SourceSpec function catalog from its TypeScript/JavaScript source, tests, and config. Use when creating, refreshing, or checking .sourcespec/catalogs/functions-catalog.yaml; never scan sibling apps or infer Requirement coverage from this inventory.
---

# SourceSpec function catalog (pilot)

Work on **one application-owned source scope**. Read its guidance, Git status, and any existing catalog before writing. This skill bundles a copy of the current SourceSpec function schema at `assets/functions.schema.yaml` and a TypeScript tool at `scripts/functions-catalog.ts`. Resolve these paths relative to this SKILL.md, not the application.

Install the skill's own pinned dependencies once: `pnpm --dir <skill-dir> install --frozen-lockfile`. For a standalone app with its own `package.json` and `tsconfig.json`, pass its absolute root. Probe first:

```bash
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/apps/api --probe
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/apps/api --write
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/apps/api --check
```

For a monorepo with **one root manifest/tsconfig but multiple logical apps**, use the absolute config root and a relative, non-root owned directory; the catalog lives inside that directory:

```bash
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --project /absolute/path/to/repo --scope server --probe
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --project /absolute/path/to/repo --scope server --write
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --project /absolute/path/to/repo --scope server --check
```

Agree on ownership before choosing scopes: `server/`, `app/`, `shared/`, and plugins can have distinct owners; don't treat a whole monorepo as one app or silently omit its tooling, tests, or migrations. All `location` paths in a scoped catalog are relative to its owned directory. The scoped mode only separates project TypeScript configuration/dependency resolution from source and catalog ownership; it does **not** make cross-app function links valid.

`--probe` is read-only: it reports file and definition counts, excluded signature-only declarations (overloads and ambient declarations have no implementation body), ownership classifications needing review, skipped generated/local directories, TypeScript version source, identity issue counts by cause/directory, and bounded examples from busy directories. It exits nonzero on blocking identities; its provisional counts are **not** a valid catalog or guarantee of completeness. Audit representative files against the source before treating a candidate count as complete. Run it before writing on brownfield projects. `--write` creates/refreshes **only** that owned scope's `.sourcespec/catalogs/functions-catalog.yaml`; `--check` never writes and fails if it differs or lacks exactly one blank line between consecutive function entries. This TypeScript/JavaScript adapter inventories app-owned function definitions, including callbacks in tests/config/migrations. It excludes imported libraries, generated directories, and sibling scopes. Each entry has `sourceScope: application | test | tooling | unclassified` describing the owning source, **not** whether its callback is a runnable test. The adapter uses file paths (`*.test.*`, `*.spec.*`, tests, `__mocks__`, migrations, config files) and a declared scope's source ownership; unmatched standalone paths remain `unclassified` for review. `sourceScope` is required; older catalogs without it are accepted only as migration input. Existing curated classifications survive refresh. Other languages need their own adapters, not filename rules baked into the schema. This adapter prefers the project's installed TypeScript version for type inference, falling back to its own pinned version when unavailable; fallback type summaries need review. Test declarations belong in the separate test catalog. Existing curated IDs persist when path, declared name, and enclosing context match; new entries use readable `fn:<project-relative-file>#<lexical-owner-chain>` IDs (for example `fn:server/auth-api.ts#createAuthHandler` or `fn:src/App.tsx#App.addTodo`). A class name, named enclosing function, or callback call-site appears in the owner chain. The adapter recognizes assignments such as `global.console.warn = () => {}`, class fields (including decorator callbacks anchored by field name), and anonymous default exports. Reordering fields does not change their identity; source order may still change catalog serialization, so rerun `--write` and review its diff. When a readable owner path collides after sanitization, or an anonymous callable has no lexical context, all affected entries gain an explicit `@utf16:start-end:ASTKind` suffix; this position-dependent fallback is visible and needs review after edits. Context-rule changes may make prior entries unmatched; reconcile existing links before refreshing, never silently replace IDs. Neither IDs nor links are call traces, completeness claims about Requirements, or proof that tests pass.

Review the diff after refresh. After any command, inspect the unresolved-scope report. If any source is genuinely ambiguous, ask the user about its listed IDs/locations and plausible ownership in one concise batch; don't silently leave it unresolved or guess. Apply their decision to the catalog, then rerun `--check`. The pilot **fails closed** if old IDs become unmatched, an identity still collides after an explicit range fallback, or a catalog entry fails the bundled schema. Before using `--write` on a catalog generated by another tool, run `--check` and verify all prior identities match; review any parameter/signature differences rather than dropping linked IDs. Reconcile a confirmed move/rename deliberately against all links before refreshing again; there is no automatic prune or cross-app matching yet. Do not remove a function simply because no Requirement links to it. Avoid staging/committing generated output without the user's separate authorization.

### Read-only lexical-identity preview

Run `scripts/functions-catalog.ts` with `--identity-preview` to examine the proposed identity rule before generating YAML. It emits JSON to stdout only; it never reads or writes a catalog. Each preview ID spells out the project-relative owning path (including the scope) and lexical/call-site owner chain. Owner labels are NFKC-normalized and unsupported punctuation/whitespace is replaced with `-`; labels are joined with `.`, with `#` separating the file from the chain. If normalized IDs collide (even for a named function) or an anonymous function has no context, **all** members of the group gain an explicit UTF-16 start/end range and AST kind as the final discriminator. Inspect `offsetFallbacks` and `issues`; only a zero-issue preview is suitable for the initial-only writer below. An ID can still change if a once-unique path becomes ambiguous, its enclosing context changes, or a range shifts. Preview does not reconcile old links or detect behavioral changes. Keep its JSON outside the application repository when experimenting.

```bash
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/app --identity-preview > /tmp/app-identity-preview.json
```

`--write-breadcrumbs` writes an **initial-only** catalog with readable IDs exactly matching the preview; `--check-breadcrumbs` checks the exact current YAML, including reviewed descriptions and type summaries preserved from its existing records; it recomputes IDs rather than trusting them. The writer refuses any existing catalog; replacing one requires reviewing old/new IDs and authored links separately. Default `--write` generates the same lexical IDs for new entries while preserving pre-existing curated IDs; it never silently prunes or transfers links. For monorepo direct root tooling, `--scope @root` writes a distinct `functions-catalog-root.yaml` without scanning sibling scopes.

```bash
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/app --write-breadcrumbs
pnpm --dir <skill-dir> exec tsx scripts/functions-catalog.ts --app /absolute/path/to/app --check-breadcrumbs
```

**Identity policy:** lexical IDs are readable, not inherently durable across a move, rename, changed call-site context, or a once-unique path becoming ambiguous. Range fallbacks also change on source insertions. Never silently transfer authored links or curated metadata after such a change. Run both inventory freshness and authored-link checks before accepting a refresh.

YAML/JSON Schema cannot validate whitespace in parsed records; the bundled schema documents the spacing convention, and `--check` enforces it on the serialized catalog. The schema is a snapshot bundled for the pilot. If SourceSpec's canonical `schema/functions.yaml` changes, compare it and update this copy deliberately rather than silently assuming they stay synchronized. Run `pnpm --dir <skill-dir> typecheck` and `pnpm --dir <skill-dir> test` for skill changes.
