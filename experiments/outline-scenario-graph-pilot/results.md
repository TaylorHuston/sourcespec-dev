# JSON-import Scenario representation trial — 2026-09-29

## Setup and reproducibility

Frozen scratch Outline revision: `05ef55e38aeb3b625e819edab907c7ee2d33af8a`. This is a non-canonical SourceSpec experiment, not an Outline Requirement or runtime test. The independent `questions.md` and answer anchors were fixed **before** the candidate artifacts and blind answers. `facts.json` is the single source for both candidate documents. `node build.mjs --check` verifies that both contain identical Scenario text, **12 checkpoint facts and links**, **15 transition facts**, intended checks, and gaps. Flat expresses transitions as ordered prose-like strings; graph gives those same transitions typed `from`/`to`/`kind`/`when` fields. The graph is 9,335 bytes vs. 8,212 bytes for flat (+1,123 bytes, ~14%), not counting the common generator. The graph has 12 nodes and 15 edges. No different facts were given to either arm. Both artifacts contain the same 14 curated function-pointer occurrences; all resolved in the scratch app/server catalogs. Test file paths exist, but no Outline tests were run (dependencies are not installed).

Two fresh-context, read-only `sdd-reviewer` agents (profile default model, high thinking, no model/thinking override, no inherited context) each read **only their assigned JSON** and received identical four questions; neither browsed source or saw the other format. Their [flat](response-flat.md) and [graph](response-graph.md) replies are preserved verbatim. This is one answer per format, not a statistically meaningful model study. We did not measure human authoring time or real debugging time.

## Adjudication against the pre-registered rubric

| Question | Flat | Graph | Concrete difference |
| --- | ---: | ---: | --- |
| 1. Last page finished; still Processing | 4/4 | 4/4 | Both started at final-task/finalizer, distinguished `Processed` from `Completed`, followed the processed-event and retry branches, and left client freshness unknown. Graph also cited `t03b`, which is equally present in flat. |
| 2. Move attachment creation after Processed | 4/4 | 3/4 | Both found the ordering seam, attachment-dependent persistence, the fixture's limits, and the live-queue coverage gap. Graph phrased missing rows as content rewriting **will fail**; the source demonstrates risk of incorrect/missing metadata or failure, not that every rewrite throws. Flat allowed failed **or** incorrect rewriting. |
| 3. Cleanup fails after Completed; UI still Processing | 4/4 | 4/4 | Both kept durable completion separate from post-completion cleanup and directed investigation to the unmapped client refresh/display seam. Both cited `cleanup-failure` without claiming a passing result. |
| 4. Completeness and authority | 4/4 | 4/4 | Both refused exact-fault, exhaustive-coverage, execution-trace, and passing-test claims. |
| **Total** | **16/16** | **15/16** | One point and a wording overclaim are not a decisive format result. |

The four-point rubric per question is first seam, correct ordered follow-ups, relevant listed IDs/checks, and cautious unknowns. The Q2 graph deduction is for the unqualified failure claim, not a demonstrated actual runtime defect. Neither response produced an additional useful branch or affected check unavailable from the other candidate. The flat respondent listed the `route-create` test as a negative-scope check (it uses Notion), whereas the graph respondent did not mention it; it was not needed for the attachment change.

## Source adjudication and reviewer disagreement

The source-backed order is `APIImportTask.onCompletion` → `JSONAPIImportTask.onAllTasksCompleted` → save `Processed` → `ImportsProcessor.onProcessed` saves `Completed` → cleanup attempt → UI label. `ImportsProcessor.ts` reads Attachment rows including `size` when rewriting imported content; absence can degrade references/metadata even if it does not necessarily throw. The exact client list update/refresh mechanism was intentionally not mapped. The fixture test manually drives tasks with scheduling mocked and calls the processed handler directly; the cleanup-failure case checks `Completed` without rendering the list.

An independent read-only source-fidelity review confirmed the task order, display mapping, cleanup semantics, function IDs, and equal facts. It raised two concerns based on its **restricted source set**:

- It could not verify `retry → errored` after exhaustion from the assigned processor file alone. We checked `server/queues/index.ts` (processor-event queue has five attempts/backoff) and `server/services/worker.ts` (on a final failed job, the worker invokes `processor.onFailed(event)`); `ImportsProcessor.onFailed` marks the Import `Errored`. The edge remains **conditional on delivery, actual failures, and worker execution**, not evidence any particular import retried.
- It could not confirm the `route-create` test uses Notion without its test source. `server/routes/api/imports/imports.test.ts` under `#imports.create`, case `should create an import`, explicitly constructs `IntegrationService.Notion`; the source claim stands. The listed test cases are still intended checks, not proven results.

These additional source checks were performed after the blind responses and did not alter either candidate. The graph's typed edges make simple referential, branch, and required-handoff checks convenient (`build.mjs` checks dangling links and specific paths); flat's strings encode the same facts and could be parsed by extra tooling. This shows **structural feasibility**, not demonstrated debugging value. No run of Outline, live queue, UI, or tests was performed; no canonical schema, Requirement, or copied skill was changed.

## Decision

Do **not** replace flat Scenarios with an authored graph on this evidence. Retain this as a worked branching case and a valid graph-format prototype: it is machine-checkable and does not inherently induce overconfidence, but it cost more structure, found no extra investigative insight in this matched-fact trial, and had one stronger-than-supported failure claim. A useful next trial would take a real change or reproduced defect, have humans author/maintain both formats with equal evidence, and measure review effort, missing links, and time-to-correct-diagnosis. Catalog links alone do not validate semantic or cross-revision continuity.
