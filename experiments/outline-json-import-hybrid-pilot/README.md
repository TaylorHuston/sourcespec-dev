# Outline JSON-import hybrid-index pilot

This is an **experiment, not a canonical SourceSpec schema or a Code Property Graph**. It asks whether a complete, disposable source index for explicitly owned scopes plus a handful of reviewed behavior links is cheaper to maintain than a persistent ID for every callback. The source is the separate, unmodified Outline scratch checkout at `05ef55e38aeb3b625e819edab907c7ee2d33af8a`. Do not write a catalog into that checkout. SourceSpec's existing full function-catalog policy is unchanged.

## Artifacts and ownership

- `scenario.md` is one authored, source-backed JSON-import investigation Scenario with distinct `Processed` and `Completed` states and test-evidence limits. It is not an Outline product requirement or a runtime trace.
- `anchors.json` is six selectively reviewed handles to an RPC handler, class methods, and a web component. The web link names an app component rather than a server handler; `imports.create` is the cross-app operation boundary.
- `snapshot-index.mjs` parses **all supported callable definitions** within either `server/` or `app/`, not just the linked files. Each exact address combines a source-content snapshot digest, scope, file, UTF-16 start/end offsets, and AST kind. It reports declarations without bodies separately, rejects parse errors and duplicate addresses, and resolves only the three syntax selectors the pilot needs. It does not resolve imports, infer invocation, track runtime closures, run tests, or infer change impact. Paths in the generated index are scoped to their owner. `shared/`, plugins, and repository-root tooling are not part of these two ownership scopes.
- `snapshot-index.test.mjs` uses disposable fixtures to test link upkeep. It never mutates Outline.
- `results.md` records the read-only investigations, verification, limits, and decision.

Use the TypeScript version pinned in `cli/` (`pnpm --dir spaces/sourcespec/cli install --frozen-lockfile` first). From the workspace root:

```bash
node --test spaces/sourcespec/experiments/outline-json-import-hybrid-pilot/snapshot-index.test.mjs
node spaces/sourcespec/experiments/outline-json-import-hybrid-pilot/snapshot-index.mjs \
  --project "$PWD/spaces/scratch/outline" --scope server \
  --anchors "$PWD/spaces/sourcespec/experiments/outline-json-import-hybrid-pilot/anchors.json"
# Repeat with --scope app. Optional --output must be a NEW absolute path outside the repositories.
```

The generated index is disposable; do not commit it or use its source offsets as stable catalog IDs. The digest covers the owned files and parser version, including tests/migrations; it is not a Git revision ID. No snapshot ID should be used as a durable Requirement link.

## Measured at the frozen Outline checkout

| Scope | Eligible source files | Implementations indexed | Body-less signatures excluded | Handles resolved uniquely |
| --- | ---: | ---: | ---: | ---: |
| `server/` | 1,104 | 8,750 | 65 | 5/5 |
| `app/` | 852 | 6,840 | 6 | 1/1 |

Within each generated snapshot, every supported implementation has a distinct address: 8,750/8,750 and 6,840/6,840. These match the function skill's post-overload candidate counts, **not** a claim that all code, dependencies, cross-scope relationships, or executed paths were discovered. Outline's dependencies are absent; the parser is the CLI's pinned TypeScript 6.0.3. No Outline tests or services were run.

A fixture test exercises **three synthetic anchors** (one per selector kind), not mutations to all six real Outline anchors. Inserting unrelated callbacks changed snapshot addresses but required **zero anchor edits**. Renaming a linked method or UI binding produced `missing`; duplicating the linked route produced `ambiguous`; replacing the route with a different operation produced `missing`. Unknown scopes and duplicate anchor IDs are rejected. All six real anchors separately resolved uniquely at the frozen checkout. This checks syntactic link maintenance, not whether the Scenario is true at runtime or whether a semantic change without a rename is detected.

## Investigation/adoption test

The two questions were fixed in `scenario.md` before separate source-only and guided investigations. Both answered them correctly and retained important unknowns; the guided run did **not** demonstrate a decisive accuracy improvement. See `results.md` for the limited comparison and remaining adoption questions. A useful hybrid should improve investigation **without** a new hand-maintained function list; unlinked callback churn must not demand review, while a broken linked handle must be visible. The earlier todo flat-versus-graph comparison is a different experiment: do not attribute an answer improvement here to Scenario formatting.
