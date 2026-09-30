# SourceSpec CLI

This is the manually runnable TypeScript/JavaScript adapter for function and test catalogs. SourceSpec's YAML contracts remain language-neutral. The CLI owns catalog generation; skills only tell an agent when to run it and which IDs, descriptions, kinds, and links to review.

From `spaces/sourcespec/`:

```bash
pnpm --dir cli install --frozen-lockfile
pnpm --dir cli test
node cli/dist/sourcespec.js sspc-functions probe --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-functions write --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-functions check --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-tests write --app /absolute/path/to/app
node cli/dist/sourcespec.js sspc-tests check --app /absolute/path/to/app
# Deliberately discard an existing catalog and regenerate it from current source:
node cli/dist/sourcespec.js sspc-functions write --app /absolute/path/to/app --force
node cli/dist/sourcespec.js sspc-tests write --app /absolute/path/to/app --force
```

For a monorepo with a shared manifest and TypeScript config, use `sspc-functions <action> --project /absolute/repo --scope server` (or `--scope @root` for direct root tooling). The CLI uses the target project's TypeScript when available; fallback inference needs review. Normal writes fail closed on stale/ambiguous identities. `write --force` intentionally ignores the existing catalog and atomically replaces it with a freshly generated one, losing all prior IDs and curated metadata (descriptions, overrides, test kinds). It still rejects ambiguities in the current source; it never rewrites authored links. Back up the old file and review the new catalog and links before using `--force`. Neither mode claims that tests pass.

To install or explicitly refresh the local executable, run `node cli/scripts/install-local.mjs` **after** installing CLI dependencies. It builds a package from this checkout and installs it only into `~/.sourcespec/`, refusing to modify an unfamiliar existing directory or executable. It does not change your shell configuration. Run `~/.sourcespec/bin/sourcespec` directly, or add `~/.sourcespec/bin` to `PATH`. The installed CLI reads and writes catalogs in the chosen app, never in the home installation. Schema copies are build artifacts from `../schema/`, not separately maintained files.

The example todo app invokes the checkout's built CLI so its tests do not depend on a particular home directory. Run `pnpm --dir cli install --frozen-lockfile && pnpm --dir cli build` before testing that app from a fresh checkout. Its Requirement checker remains app-local for now.
