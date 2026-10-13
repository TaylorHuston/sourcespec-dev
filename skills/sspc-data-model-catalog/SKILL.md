---
name: sspc-data-model-catalog
description: Inventory and check one application's SQLite physical data model against an authored SourceSpec map using the CLI; never read user rows or treat generated structure as semantic coverage.
---

# SourceSpec data-model catalog

Read the app's guidance, Git status, DDL/initializer, existing `.sourcespec/data-models/*.yaml` maps, and catalog. Choose **one application and one explicitly initialized schema-only SQLite database**. Do not run against a user's persistent database or copy its data: initialize a disposable database through the app's own schema/migration path, then delete it after use. For the todo example, `npm run data-model:probe`, `npm run data-model:refresh`, and `npm run data-model:check` from the app directory create and clean up this disposable database automatically.

For other SQLite apps, use the [SourceSpec CLI](../../cli/README.md) after explicitly installing it and the shared schemas at `~/.sourcespec/schema/`:

```bash
~/.sourcespec/bin/sourcespec sspc-data-models probe --app /absolute/path/to/app --sqlite /absolute/path/to/disposable-schema.sqlite
~/.sourcespec/bin/sourcespec sspc-data-models write --app /absolute/path/to/app --sqlite /absolute/path/to/disposable-schema.sqlite
~/.sourcespec/bin/sourcespec sspc-data-models check --app /absolute/path/to/app --sqlite /absolute/path/to/disposable-schema.sqlite
```

`probe` reports counts without writing. `write` inventories physical tables, columns, foreign keys, and indexes in `.sourcespec/catalogs/data-model-catalog.yaml`; `check` compares the catalog against the supplied database and validates authored maps and physical references. Views, triggers, and virtual tables fail closed rather than being silently omitted. The catalog is generated navigation, not the authoritative DDL. It includes SQLite DDL and default expressions: inspect for sensitive literals before sharing or committing. Review added/removed IDs, changed constraints, authored map links, and the YAML diff. Normal writes refuse lost IDs; only with explicit permission to discard old IDs use `sspc-data-models write ... --force`. It does **not** rewrite authored maps. Do not use a force write to bypass an invalid map or unsupported source. Do not claim that an inventory or passing check proves domain meaning, migrations on existing data, or test results. Run app tests after reviewing. Do not commit without authorization.
