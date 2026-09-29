# SourceSpec catalog skills

These are portable copies of the workspace's `sspc-functions-catalog` and `sspc-tests-catalog` pilot skills. Each skill has its own `SKILL.md`, schema snapshot, pinned dependencies, generator, and fixture tests. The TypeScript/JavaScript adapters work on **one app root at a time**; they do not make the SourceSpec format language-specific.

Install dependencies inside the skill you want to run, then follow its `SKILL.md`. Do not add `node_modules/` or generated test/build artifacts to this repository. The canonical schemas for these copies are [`../schema/functions.yaml`](../schema/functions.yaml) and [`../schema/tests.yaml`](../schema/tests.yaml); keep each bundled `assets/*.schema.yaml` byte-for-byte synchronized with its canonical schema.

When changing a catalog skill, update the workspace skill and this copy together, review their diff, and run that skill's `typecheck` and `test` scripts. Catalog refreshes still require review of IDs, classification, and curated descriptions; a passing check does not prove Requirement coverage or passing application tests.
