# SourceSpec CLI

This CLI inventories TypeScript/JavaScript functions and tests and validates authored Requirements against shared, language-neutral schemas installed in `~/.sourcespec/schema/`. Skills only tell an agent when to run it and which records and links to review.

From `spaces/sourcespec/`:

```bash
pnpm --dir cli install --frozen-lockfile
pnpm --dir cli test
node cli/scripts/install-local.mjs
node cli/dist/sourcespec.js sspc-functions probe --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-functions write --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-functions check --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-tests write --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-tests check --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-requirements check --app /absolute/path/to/app
# Deliberately discard an existing catalog and regenerate it from current source:
node cli/dist/sourcespec.js sspc-functions write --app /absolute/path/to/app --force
node cli/dist/sourcespec.js sspc-tests write --app /absolute/path/to/app --force
```

Install the CLI first (below). The installer puts the `data-models`, `functions`, `operations`, `requirements`, and `tests` schemas in `~/.sourcespec/schema/`. All CLI checks and writes read those shared schemas; none copy schemas into an app. If an installed schema differs from the checkout's template, installation stops before modifying the CLI. Review the difference before replacing the schema explicitly and reinstalling.

For a monorepo with a shared manifest and TypeScript config, use `sspc-functions <action> --project /absolute/repo --scope server` (or `--scope @root` for direct root tooling). The CLI uses the target project's TypeScript when available; fallback inference needs review. Normal writes fail closed on stale/ambiguous identities. `write --force` intentionally ignores the existing catalog and atomically replaces it with a freshly generated one, losing all prior IDs and curated metadata (descriptions, overrides, test kinds). It still rejects ambiguities in the current source; it never rewrites authored links. Back up the old file and review the new catalog and links before using `--force`. Neither mode claims that tests pass. `sspc-requirements check` validates authored Requirement shape, IDs, and catalog links without parsing application code, so it is language-neutral. Run `sspc-tests check` separately for JavaScript/TypeScript declaration discovery. Neither command generates Requirements or mappings or establishes semantic coverage.

To install or explicitly refresh the local executable, run `node cli/scripts/install-local.mjs` **after** installing CLI dependencies. It builds a package from this checkout and installs it only into `~/.sourcespec/`, refusing to modify an unfamiliar existing directory or executable. It does not change your shell configuration. Run `~/.sourcespec/bin/sourcespec` directly, or add `~/.sourcespec/bin` to `PATH`. The installed CLI reads shared schemas from `~/.sourcespec/schema/` and reads/writes catalogs only in the chosen app. The templates bundled with the package are build artifacts from `../schema/`, not a separate source of truth.

The example todo app invokes the checkout's built CLI. Install it into `~/.sourcespec/` before running its checks (the checkout CLI also reads the installed schemas). CLI tests use disposable homes; they do not depend on or modify the user's installation.
