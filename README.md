# SourceSpec

SourceSpec is an experiment in describing **what an application currently does and where to investigate how it does it**. It connects user-facing goals and concrete Requirements to curated code and test pointers without requiring a particular development process. The format is still being tested against a small local application; it is not a claim that documentation alone proves the app works.

The repository is public, but it is a playground, not a production-ready specification or service. This is conceptually related to but technically separate from my [Story Driven Development](https://github.com/TaylorHuston/sdd-skills) workflow.

## The experiment

The [todo example](example-apps/example-todo/README.md) keeps these concerns separate:

| Record | Location | Purpose |
| --- | --- | --- |
| Stories | [`docs/stories/`](example-apps/example-todo/docs/stories/) | Markdown accounts of user goals and context. Their structured references can group multiple Requirements, and a Requirement can serve multiple Stories. Stories are optional to the SourceSpec core. |
| Requirements | [`.sourcespec/requirements/`](example-apps/example-todo/.sourcespec/requirements/) | One current-state `SHALL` obligation per YAML file, with named GIVEN/WHEN/THEN Scenarios. Optional `implementedBy` and `verifiedBy` links point to relevant catalog entries. |
| Function and test catalogs | [`.sourcespec/catalogs/`](example-apps/example-todo/.sourcespec/catalogs/) | Readable lexical IDs for app-owned functions (`fn:<file>#<owner.function>`) and catalog IDs for intended checks. Only ambiguous functions use explicit position-dependent range suffixes; moves and collisions require link review. Generated functions identify their owning source as application, test, tooling, or unclassified; this does not make test helpers runnable tests. The test catalog uses readable lexical IDs from test files, suites, and titles, with reviewed descriptions and kinds. |
| HTTP operation map | [`.sourcespec/operations/`](example-apps/example-todo/.sourcespec/operations/) | Links OpenAPI operation IDs to shared runtime mounts, handlers, and intended tests. [`openapi.yaml`](example-apps/example-todo/openapi.yaml) owns HTTP methods, paths, payloads, and responses. |
| Data-model map | [`.sourcespec/data-models/`](example-apps/example-todo/.sourcespec/data-models/) | Explains persisted tables and relationships and points to code and API representations. The app's DDL owns physical columns and constraints. |

For example, [`task-visibility.yaml`](example-apps/example-todo/.sourcespec/requirements/task-visibility.yaml) is shared by the [private account access](example-apps/example-todo/docs/stories/private-account-access.md) and [manage tasks](example-apps/example-todo/docs/stories/manage-tasks.md) Stories. Having an account is a prerequisite for managing tasks; seeing only the current account's saved tasks is a guarantee relevant to both goals. No one-to-one Story–Requirement rule is implied.

Requirements and named Scenarios are the todo example's sole current-state behavior format; the earlier parallel Behaviors were retired. [`schema/`](schema/) contains the evolving YAML schemas, including the [Requirements schema](schema/requirements.yaml); [`cli/`](cli/README.md) owns the function and test catalog generators; [`tools/`](tools/) contains the example app's Requirement checker. [`skills/`](skills/README.md) contains thin agent-facing CLI instructions. [`sourcespec-devlog.md`](sourcespec-devlog.md) is an informal experiment log, not normative documentation.

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

- `npm run requirements:check` validates Requirement YAML against JSON Schema Draft 2020-12, filename and Scenario IDs, referenced function/test IDs, and the todo app's static test declarations (including suites) and lexical IDs against its catalog.
- Build the [CLI](cli/README.md) once from this checkout. `npm run catalog:check` checks that the function catalog still covers all app-owned function definitions, including anonymous callbacks, config, and test functions, and has one blank line between entries. Run `npm run catalog:refresh` after code edits or spacing fixes and review ID reconciliation. For test-declaration changes, run `npm run tests-catalog:refresh` and review curated metadata and intended-check links.
- `npm test` runs both checks and the example's component, API, and contract tests. `npm run build` runs both checks, type-checks, and builds the client.

These checks establish **shape, discoverability, and some tested behavior**, not that a Requirement's prose matches reality. `implementedBy` is an investigation map, not an exhaustive call graph; `verifiedBy` identifies intended tests, not their results. A missing SourceSpec link does not prove code is absent, unused, or safe to remove. Assess consequential claims against the code and focused running tests.

## Conventions and scope

- `.sourcespec/` describes the **current application**. Planned or in-progress work belongs in Stories or another planning workflow outside it until the behavior exists; do not add lifecycle `status` fields to Requirements.
- Requirement YAML uses kebab-case filenames matching `id`; its `scenarios` have stable IDs and nonempty list-form `given`, `when`, and `then`. Schema-defined fields such as `implementedBy` retain their casing. Stories begin with an “As a … I should … so that …” goal and keep machine-readable related-record references in frontmatter.
- Shared Requirements express independent guarantees, not a reason to duplicate the same normative rule in every Story. A Story can also refer to operations and data models without redefining their contracts.
- SourceSpec is independent of SDD and OpenSpec. No adapter, generator for Requirements, automatic semantic verification, or full-repository orphan analysis is implemented here.

For work in this repository, read [`AGENTS.md`](AGENTS.md) for local boundaries, verification, and Git safety. Contributions should preserve the experimental distinctions above rather than treating the example as a finished standard.
