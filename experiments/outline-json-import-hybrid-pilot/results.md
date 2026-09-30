# Pilot results — Outline `05ef55e`

## Index and maintenance checks

The read-only parser indexed **8,750/8,750 unique snapshot addresses** in 1,104 server files and **6,840/6,840** in 852 app files. It excluded 65 and 6 body-less signatures respectively. All six selected anchors resolved to exactly one callable in the frozen source. The counts match the function skill's eligible post-overload candidates, but neither tool proves semantic completeness. Only two owned scopes were scanned; `shared/`, plugins, and dependencies were not. The parser does not build a CPG, infer edges, or run code.

One disposable-fixture test passed. It used **three synthetic anchors** representing the route, method, and bound-call-argument selector shapes; it did not mutate all six real Outline anchors. Inserting unlinked callbacks shifted snapshot addresses but left the corresponding synthetic route and UI anchors uniquely resolvable without anchor-file edits. Renaming a linked method or UI binding reported `missing`; duplicating the linked route reported `ambiguous`; changing its operation name reported `missing`. Unknown anchor scopes and duplicate anchor IDs are rejected. The separate frozen-source probe resolved all six real Outline anchors uniquely. These are **syntactic** maintenance checks, not a demonstration that ordinary semantic refactors can be reconciled automatically. The test does not detect a behavioral change when the selector still matches.

## Two independent investigations

Two fresh-context, read-only `general-purpose` agents (default model and thinking settings, no overrides, no inherited context or delegation) answered the two questions prewritten in `scenario.md`. One could inspect only Outline source; the other could also read the experiment Scenario and anchor mappings. Neither ran Outline tests. This is an informal comparison, not a blinded or statistically meaningful benchmark; the guided agent received extra authored facts.

| Criterion | Source only | Scenario + index |
| --- | --- | --- |
| Stuck on “Processing” | Located the final task retry/handoff, `Processed` → `imports.processed` → `Completed`, and UI state mapping. | Located the same handoffs and UI mapping; also described client update/list refresh as a possible later boundary. |
| Moving attachment creation after `Processed` | Identified missing rows/blobs, size hydration, retry, and archive-cleanup risks; cited relevant task fixture. | Identified the ordering/manifest/persistence boundary, missing references or metadata, and archive-cleanup risk; noted the route creation test uses Notion rather than JSON. |
| Evidence limits | Explicitly requested live states, queue attempts, and client evidence; did not claim executed coverage. | Same, and correctly treated six resolved anchors as locations rather than proof of execution. |

The source-only agent reported about 3–5 minutes and the guided agent about one minute, but these are self-reports from two individual agents with differing exploration paths and cannot establish a time advantage. Both answered the substantive questions correctly; this run **does not demonstrate a decisive investigation-quality advantage** for the added index/Scenario. The index's demonstrated benefit is narrower: complete snapshot-level addressing in these scopes without demanding durable IDs for every callback, plus fail-closed resolution of six selected links in simple change fixtures.

## Decision and gaps

Keep the pilot separate from canonical `.sourcespec/`. Do not replace the full function catalog, switch canonical Requirements to graphs, or describe the index as live data flow on this evidence. To justify a production layer, repeat on an actual change that edits a linked implementation while preserving its behavior, measure human review effort with developers, and compare with a source-only baseline that has equivalent facts. The current selector recognizers inspect syntax only; they do not resolve imports, compare semantic bodies, or guarantee that a still-matching link remains behaviorally valid. The authored Scenario also leaves client refresh/update mechanics implicit; review that boundary before claiming a full visible-completion map.
