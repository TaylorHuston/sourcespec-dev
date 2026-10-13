# SourceSpec

SourceSpec is an experiment in describing **what an application currently does and where to investigate how it does it**. It connects user-facing goals and concrete Requirements to curated code and test pointers without requiring a particular development process. The format is still being tested against a small local application; it is not a claim that documentation alone proves the app works.

The repository is public, but it is a playground, not a production-ready specification or service. This is conceptually related to but technically separate from my [Story Driven Development](https://github.com/TaylorHuston/sdd-skills) workflow.

## The experiment

The [todo example](example-apps/example-todo/README.md) keeps these concerns separate:

| Record | Location | Purpose |
| --- | --- | --- |
| Stories | [`docs/stories/`](example-apps/example-todo/docs/stories/) | Markdown accounts of user goals and context. Their structured references can group multiple Requirements, and a Requirement can serve multiple Stories. Stories are optional to the SourceSpec core. |
| Requirements | [`.sourcespec/requirements/`](example-apps/example-todo/.sourcespec/requirements/) | One current-state `SHALL` obligation per YAML file, with named GIVEN/WHEN/THEN Scenarios. Optional `implementedBy` and `verifiedBy` links point to relevant catalog entries. |
| Shared schemas | `~/.sourcespec/schema/` | Installed from [`schema/`](schema/) alongside the CLI; validation uses these files, not app-owned copies. |
| Function and test catalogs | [`.sourcespec/catalogs/`](example-apps/example-todo/.sourcespec/catalogs/) | Readable lexical IDs for app-owned functions (`fn:<file>#<owner.function>`) and catalog IDs for intended checks. Collisions and context-free anonymous functions use explicit position-dependent UTF-16 range suffixes; moves and collisions require link review. Generated functions identify their owning source as application, test, tooling, or unclassified; this does not make test helpers runnable tests. The test catalog uses readable lexical IDs from test files, suites, and titles, with reviewed descriptions and kinds. |
| HTTP operation map | [`.sourcespec/operations/`](example-apps/example-todo/.sourcespec/operations/) | Links OpenAPI operation IDs to shared runtime mounts, handlers, and intended tests. [`openapi.yaml`](example-apps/example-todo/openapi.yaml) owns HTTP methods, paths, payloads, and responses. |
| Data-model map and physical catalog | [`.sourcespec/data-models/`](example-apps/example-todo/.sourcespec/data-models/) and [`.sourcespec/catalogs/data-model-catalog.yaml`](example-apps/example-todo/.sourcespec/catalogs/data-model-catalog.yaml) | The authored map explains table purposes and relationships; the SQLite-generated catalog inventories columns, keys, indexes, and DDL from a disposable database. The app's DDL remains authoritative. |

For example, [`task-visibility.yaml`](example-apps/example-todo/.sourcespec/requirements/task-visibility.yaml) is shared by the [private account access](example-apps/example-todo/docs/stories/private-account-access.md) and [manage tasks](example-apps/example-todo/docs/stories/manage-tasks.md) Stories. Having an account is a prerequisite for managing tasks; seeing only the current account's saved tasks is a guarantee relevant to both goals. No one-to-one Story–Requirement rule is implied.

Requirements and named Scenarios are the todo example's sole current-state behavior format; the earlier parallel Behaviors were retired. [`schema/`](schema/) contains the evolving YAML templates, including the [Requirements schema](schema/requirements.yaml). [`cli/`](cli/README.md) installs those templates into `~/.sourcespec/schema/`, generates app-owned function and test inventories, and checks authored Requirements against the installed schemas. [`skills/`](skills/README.md) contains thin agent-facing CLI instructions. [`sourcespec-devlog.md`](sourcespec-devlog.md) is an informal experiment log, not normative documentation.

## CLI and skills inventory

The [`@sourcespec/cli`](cli/package.json) package contains TypeScript/JavaScript catalog adapters, a SQLite schema adapter, and a language-neutral Requirement checker. Install its dependencies with `pnpm --dir cli install --frozen-lockfile`, then run `node cli/scripts/install-local.mjs` to install `~/.sourcespec/bin/sourcespec` and six shared schemas (`data-model-catalog`, `data-models`, `functions`, `operations`, `requirements`, `tests`) under `~/.sourcespec/schema/`. This explicit installation does not change `PATH` or copy schemas into an app. Run `pnpm --dir cli build`, `pnpm --dir cli typecheck`, or `pnpm --dir cli test` for package development; see the [CLI guide](cli/README.md) for checkout-local invocations and installation safeguards.

| CLI command | Actions | Owner and result |
| --- | --- | --- |
| `sourcespec sspc-functions` | `probe`, `write`, `check` | Inventories all owned TypeScript/JavaScript callable definitions, including callbacks in app source, tests, and config. `probe` reports scope and identity issues without writing; `write` creates or refreshes `.sourcespec/catalogs/functions-catalog.yaml`; `check` detects stale or malformed inventories. |
| `sourcespec sspc-tests` | `write`, `check` | Inventories statically named test declarations and suites in one app, writing or checking `.sourcespec/catalogs/tests-catalog.yaml`. It has no `probe` action; helpers remain function-catalog entries, not test declarations. |
| `sourcespec sspc-data-models` | `probe`, `write`, `check` | Inventories SQLite tables, columns, keys, and indexes from an existing schema-only database supplied with `--sqlite /absolute/path/to/disposable.sqlite`. `write` creates `.sourcespec/catalogs/data-model-catalog.yaml`; `check` detects drift and validates authored data-model maps and their physical references. It does not read rows or initialize the app. |
| `sourcespec sspc-requirements` | `check` | Validates authored `.sourcespec/requirements/*.yaml` records against installed schemas and resolves function/test catalog IDs. It does not generate Requirements, semantic links, or test results. |

Pass `--app /absolute/path/to/app` to each command. The data-model command additionally requires `--sqlite` pointing to a disposable database initialized by the app (the todo scripts create and remove one for every run); it refuses views, triggers, or virtual tables rather than silently omitting them. Only `sspc-functions` also accepts `--project /absolute/path/to/repo --scope <relative-owned-directory|@root>` for projects with shared configuration; `@root` inventories direct root tooling, not sibling apps. The three inventory commands accept `--force` **only with `write`**: it replaces the previous catalog, discards curated metadata and old IDs, and never repairs authored links. Normal writes fail closed on removed or ambiguous identities. Review the source, generated diff, and affected links before any forced replacement.

The repository ships three agent-facing skills; each is an instruction-only wrapper around that CLI, with no bundled generators, schemas, or dependencies:

| Skill | Purpose |
| --- | --- |
| [`sspc-functions-catalog`](skills/sspc-functions-catalog/SKILL.md) | Choose and probe one owned function scope, write/check its complete inventory, then review lexical IDs, source scopes, type hints, and any identity churn. |
| [`sspc-tests-catalog`](skills/sspc-tests-catalog/SKILL.md) | Write/check one app's test declarations, then review titles, intended-check links, descriptions, and inferred or unclassified test kinds. |
| [`sspc-data-model-catalog`](skills/sspc-data-model-catalog/SKILL.md) | Initialize a disposable SQLite schema through the app, probe/write/check its physical catalog, then review IDs and authored table and relationship references. |

There is no separate Requirement skill or CLI writer, and no CLI command for operation maps. The data-model map remains authored; the SQLite catalog and map checks do not generate semantic relationships. The shared operation schema is a template, not a generated catalog. The CLI itself is described at [`cli/.sourcespec/`](cli/.sourcespec/).

## Try the example

Node.js **26+** is required for the example's built-in `node:sqlite` database. It uses npm and runs entirely on your machine; no external service is required.

```bash
cd example-apps/example-todo
npm ci
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite. Register a local account, then add, complete, reopen, and remove tasks. The SQLite database at `.data/todos.sqlite` is ignored by Git; do not use a password from a real account. See the [example README](example-apps/example-todo/README.md) for authentication, migration, and local-server details. The example is loopback-only and is **not production-hardened**.

Useful checks from the example app directory:

- Install the CLI to populate `~/.sourcespec/schema/` before running app checks. `npm run data-model:probe`, `npm run data-model:refresh`, and `npm run data-model:check` use a fresh, temporary SQLite database, not your saved tasks. `npm run requirements:check` validates Requirement YAML against the installed JSON Schema Draft 2020-12 schema, filename and Scenario IDs, and referenced function/test IDs. `npm run tests-catalog:check` independently compares JavaScript/TypeScript test declarations (including suites) and lexical IDs with the test catalog.
- Install the [CLI](cli/README.md) from this checkout. `npm run catalog:check` and `npm run tests-catalog:check` check the catalogs using the installed shared schemas; the function check covers all app-owned function definitions, including anonymous callbacks, config, and test functions, and requires one blank line between entries. Run `npm run catalog:refresh` after code edits or spacing fixes and review ID reconciliation. For test-declaration changes, run `npm run tests-catalog:refresh` and review curated metadata and intended-check links.
- `npm test` runs catalog, data-model, and Requirement checks plus the example's component, API, and contract tests. `npm run build` repeats these checks, type-checks, and builds the client.

These checks establish **shape, discoverability, and some tested behavior**, not that a Requirement's prose matches reality. `implementedBy` is an investigation map, not an exhaustive call graph; `verifiedBy` identifies intended tests, not their results. A missing SourceSpec link does not prove code is absent, unused, or safe to remove. Assess consequential claims against the code and focused running tests.

## Conventions and scope

- `.sourcespec/` describes the **current application**. Planned or in-progress work belongs in Stories or another planning workflow outside it until the behavior exists; do not add lifecycle `status` fields to Requirements.
- Requirement YAML uses kebab-case filenames matching `id`; its `scenarios` have stable IDs and nonempty list-form `given`, `when`, and `then`. Schema-defined fields such as `implementedBy` retain their casing. Stories begin with an “As a … I should … so that …” goal and keep machine-readable related-record references in frontmatter.
- Shared Requirements express independent guarantees, not a reason to duplicate the same normative rule in every Story. A Story can also refer to operations and data models without redefining their contracts.
- SourceSpec is independent of SDD and OpenSpec. No generator for Requirements or mappings, automatic semantic verification, or full-repository orphan analysis is implemented here. The Requirement checker validates authored records and static references, not meaning.

For work in this repository, read [`AGENTS.md`](AGENTS.md) for local boundaries, verification, and Git safety. Contributions should preserve the experimental distinctions above rather than treating the example as a finished standard.
