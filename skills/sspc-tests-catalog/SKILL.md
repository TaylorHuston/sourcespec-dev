---
name: sspc-tests-catalog
description: Generate or check one application's full inventory of declared automated tests in .sourcespec/catalogs/tests-catalog.yaml. TypeScript/JavaScript adapter; test helpers belong in the function catalog, not as test records.
---

# SourceSpec test catalog

Work on one app with `package.json` and `tsconfig.json`. Read its guidance, Git status, tests, and existing catalog first. Install this skill's pinned dependencies once with `pnpm --dir <skill-dir> install --frozen-lockfile`. Resolve `scripts/tests-catalog.ts` and `assets/tests.schema.yaml` relative to this file, not the app.

```bash
pnpm --dir <skill-dir> exec tsx scripts/tests-catalog.ts --app /absolute/path/to/app --write
pnpm --dir <skill-dir> exec tsx scripts/tests-catalog.ts --app /absolute/path/to/app --check
```

This TypeScript/JavaScript adapter inventories static `it`/`test` declarations and nested `describe` suites in app-owned test files, including common `.skip`, `.only`, and `.each` forms. One `test.each` declaration is one record, not one per data row. Fixtures, mocks, suite callbacks, and helpers remain in the separate function inventory. Dynamic titles and custom wrappers need review; other languages need other adapters.

IDs use `test:<relative-file>#<suite.test-title>` with normalized path and title segments. `--write` preserves reviewed descriptions and kinds **only when the existing lexical ID still matches the same declaration**. It refuses duplicate or changed identities and unmatched prior entries; review intended-check links and use a task-specific one-off script outside this skill for deliberate reconciliation. New descriptions require review. The adapter infers `component` from invoked React renderers and `api` from invoked Supertest; other or conflicting evidence remains `unclassified`, not a guess. Review those kinds and the source, then run `--check`. The check enforces the full inventory and one blank line between records; it does not prove tests pass or cover Requirements. Do not commit without authorization.

The bundled schema is a copy of SourceSpec's `schema/tests.yaml`; compare it when changing either. For skill changes run `pnpm --dir <skill-dir> typecheck` and `pnpm --dir <skill-dir> test`.
