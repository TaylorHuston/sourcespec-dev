---
name: sspc-tests-catalog
description: Generate or check one application's full inventory of declared automated tests in .sourcespec/catalogs/tests-catalog.yaml. TypeScript/JavaScript adapter; test helpers belong in the function catalog, not as test records.
---

# SourceSpec test catalog (pilot)

Work on **one application root** with `package.json` and `tsconfig.json`. Read its guidance, Git status, current tests, and existing catalog before writing. Resolve scripts and the bundled `assets/tests.schema.yaml` relative to this skill, not the app. Install this skill's pinned dependencies once with `pnpm --dir <skill-dir> install --frozen-lockfile`.

```bash
pnpm --dir <skill-dir> exec tsx scripts/tests-catalog.ts --app /absolute/path/to/apps/web --check
pnpm --dir <skill-dir> exec tsx scripts/tests-catalog.ts --app /absolute/path/to/apps/web --write
pnpm --dir <skill-dir> exec tsx scripts/tests-catalog.ts --app /absolute/path/to/apps/web --check
pnpm --dir <skill-dir> typecheck
pnpm --dir <skill-dir> test
```

This is a **TypeScript/JavaScript test-declaration adapter**, not a language-neutral discovery rule. It scans app-owned `*.test.*`, `*.spec.*`, `test(s)/`, and `__tests__/` source files for `it`/`test` declarations and nested `describe` suites (including common `.skip`, `.only`, and `.each` forms). One `test.each` declaration is **one** inventory record, not one per data row. Setup, fixtures, mocks, `describe` callbacks, and nested helper callbacks are not test records; they remain functions with `sourceScope: test` in the separate full function inventory. Other languages/frameworks need separate adapters. Custom wrappers, runtime-constructed names, and unsupported declaration forms require review; do not claim universal discovery.

`--write` only creates/refreshes this app's `.sourcespec/catalogs/tests-catalog.yaml`. It preserves IDs, descriptions, and curated kinds for unambiguous `(source file, suite, test name)` matches. This adapter classifies individual test bodies as `component` when they invoke React Testing Library's `render`/`renderHook` or React's server renderers, and as `api` when they invoke Supertest. Merely importing a package is insufficient; conflicting evidence stays `unclassified`. New tests receive an opaque ID and an explicit review-needed description—**not** a claim about what the test proves. Previously generated `unclassified` kinds may be upgraded when clear evidence appears. Review and curate descriptions before citing tests as intended checks. The script refuses duplicate identities, invalid prior records, or unmatched existing IDs rather than silently pruning or reassigning links. For confirmed moves/renames, reconcile the existing entry and its links deliberately before refreshing; no automatic cross-file matching or removal is provided. `--check` is read-only and rejects stale inventory or missing blank lines between entries. After either command, **inspect the unresolved-kind report** and the test source. If any kind is genuinely unclear, ask the user about the listed test IDs/locations and plausible classifications in one concise batch; do not guess or silently accept `unclassified`. Apply their decisions to the catalog, then rerun `--check` and preserve curated values. Neither the catalog nor a successful check proves a test passes or covers a Requirement.

The bundled test schema is a snapshot of `spaces/sourcespec/schema/tests.yaml`; compare and update it deliberately if the canonical schema changes. Do not stage or commit generated output without separate authorization.
