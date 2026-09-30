# Outline JSON-import Scenario: flat vs. graph

A matched-fact, non-canonical experiment against scratch Outline `05ef55e38aeb3b625e819edab907c7ee2d33af8a`. Read [results.md](results.md) for the comparison and its limits. This is not an Outline Requirement, an executable workflow, or proof of tests passing.

- [questions.md](questions.md): questions, grading rubric, and source-checked adjudication anchors fixed before the candidates were built.
- [facts.json](facts.json): one authored source of Scenario text, selected catalog pointers, test declarations/limits, checkpoint facts, and transition facts.
- [flat.json](flat.json), [graph.json](graph.json): generated candidate views with identical facts and links; only the progression representation differs. Each respondent read just one candidate.
- [response-flat.md](response-flat.md), [response-graph.md](response-graph.md): verbatim independent responses.
- [build.mjs](build.mjs): built-in Node-only equality, dangling-edge, branch, and main-path checks. Run `node build.mjs --check` to compare candidates with `facts.json`; `--write` regenerates them after a deliberate facts edit. Do not run `--write` merely to make a failing check green.

The source checkout is `spaces/scratch/outline/`, with provisional function IDs in its generated app/server catalogs. The experiment's links are curated navigation pointers, not inferred call edges. Web-to-server communication cites the consumed `imports.create` operation; it does not cite a sibling-app handler as the client's implementation. Outline dependencies were not installed, and no tests or services were run for this comparison.
