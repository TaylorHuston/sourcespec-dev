# SourceSpec catalog skills

This repository owns the `sspc-functions-catalog` and `sspc-tests-catalog` skills. Each contains a short operating guide, bundled schema copy, pinned dependencies, generator, and fixture tests. The TypeScript/JavaScript adapters inventory one owned application scope at a time; the function adapter can resolve TypeScript from a separate monorepo project root. SourceSpec itself remains language-neutral.

Install dependencies inside the skill you want to run, then follow its `SKILL.md`. Do not add `node_modules/` or generated test/build artifacts to this repository. The canonical schemas for these copies are [`../schema/functions.yaml`](../schema/functions.yaml) and [`../schema/tests.yaml`](../schema/tests.yaml); keep each bundled `assets/*.schema.yaml` byte-for-byte synchronized with its canonical schema.

When changing a catalog skill, update the installed workspace copy deliberately, compare the schema and script copies, and run the skill's `typecheck` and `test` scripts. The normal commands are `--write` and `--check` (plus `--probe` for the function inventory). Migration and link reconciliation are one-off tasks outside the skills. Catalog refreshes still require review of IDs, classifications, and curated descriptions; a passing check does not prove Requirement coverage or passing application tests.
