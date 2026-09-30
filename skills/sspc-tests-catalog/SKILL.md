---
name: sspc-tests-catalog
description: Generate or check one application's full inventory of declared automated tests in .sourcespec/catalogs/tests-catalog.yaml. TypeScript/JavaScript adapter; test helpers belong in the function catalog, not as test records.
---

# SourceSpec test catalog

Read the app's guidance, Git status, test source, and existing catalog. Run the user-installed CLI (installation and source: `spaces/sourcespec/cli/README.md`) against exactly one app:

```bash
~/.sourcespec/bin/sourcespec sspc-tests write --app /absolute/path/to/app
~/.sourcespec/bin/sourcespec sspc-tests check --app /absolute/path/to/app
```

This adapter inventories static `it`/`test` declarations, named suites, and common `.each` variants. Helpers and suite callbacks belong to the separate function catalog. Its IDs use `test:<relative-file>#<suite.test-title>`; a move or title change needs separate review of intended-check links. Normal writes fail closed on unmatched or ambiguous declarations instead of reassigning them. Only with explicit approval to discard the old catalog, use `sspc-tests write --app /absolute/path/to/app --force`: it atomically replaces the catalog, losing curated descriptions/kinds and old IDs. Back up the file and review links and the regenerated inventory first. Review new descriptions, inferred `component`/`api` kinds, `unclassified` cases, and the YAML diff; do not claim that a catalog link proves coverage or a test run. Run `check` after review. Do not commit without authorization.
