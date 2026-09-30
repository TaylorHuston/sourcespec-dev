# Blind Scenario-format comparison

This is an experiment, not a canonical SourceSpec record. Give separate, fresh-context LLMs **only one** of `flat.yaml` or `graph.yaml` plus the four questions below. Do not give them source code, the other YAML, these evaluation notes, or earlier conversation. Use the same model/settings and instructions; do not let them browse the repository. The control is a snapshot of the existing `add-task` / `task-added` Scenario. The graph preserves its GIVEN/WHEN/THEN statements and three intended-test links, but adds authored checkpoints, explicit order, and the OpenAPI operation ID.

## Questions (fixed before the blind runs)

1. A signed-in person submits `  Buy milk  `. The network panel shows a successful create response containing the saved task, but the list stays unchanged and the draft is not cleared. Where would you investigate first, what would you check next, and what is **not** proven by this observation? Cite the identifiers in your YAML.
2. The UI briefly shows the new task, but after a reload it is missing. Trace what this YAML lets you check, name its relevant intended tests, and identify any part of the reload investigation this YAML does **not** map. Do not assume tests have passed.
3. We want to move trimming of non-blank task text from the client to the API (the server will accept raw non-blank drafts and save trimmed text). Which checkpoints or linked functions, outcomes, and intended tests would you review? What related behavior cannot be fully enumerated from this one Scenario?
4. From this YAML alone, can you tell exactly which code is broken in case 1, or enumerate every function and test that could be affected by case 3? State the limits plainly.

For each answer request: first investigation point, follow-ups, relevant function/operation/test IDs present in the YAML, unknowns, and no claims about source code or passing tests not supported by the YAML. Each respondent is told that the YAML is an authored map, not an execution trace.

## Pre-registered evaluation criteria

Rate each answer against the artifact, not presumed implementation. Per question, count: (a) identifies the useful first boundary/checkpoint or affected segment, (b) gives defensible follow-up checks and intended test IDs, (c) distinguishes known observations from unknowns without inventing runtime facts, and (d) identifies scope gaps rather than claiming completeness. Compare whether the graph provides a more ordered/locatable investigation or a more accurate impact list **without increasing overconfident assertions**. Record concrete differences and costs (extra prose, duplicated assertions, mapping gaps); do not declare a winner from fluent wording alone.

Source-checked adjudication anchors, written before the blind runs:

- Case 1: The earliest likely divergence after the observed successful response is UI handling/rendering (`add-task-submission`, `todo-interface`; `add-task-trims-input` is intended). A success response is not independent proof of durable SQLite storage, tests passing, or the exact defect.
- Case 2: Consider both persistence (`store-create-task`, `sqlite-tasks-survive-reopen`, API intended test) **and** the reload/listing path. The authored graph stops at display and has no reload fetch/list operation. The flat Scenario names `todo-interface` as loading saved tasks but does not map the reload chain. Neither artifact establishes which side failed.
- Case 3: Client trim/submission, `client-create-task`, `createTodo`, API validation, storage, UI result, and the listed UI/API/persistence intended checks are relevant. `add-task-trims-input` currently checks client submission of trimmed text, so its expectation needs review. Blank-input and save-failure cases, unrelated callers, and any other dependencies are outside this one Scenario; a full impact claim needs more records and source inspection.
- Case 4: Neither format is an exhaustive call graph, runtime trace, source inspection, or proof of passing tests. An authored order can prioritize checks but cannot identify the exact root cause.

Limitations of this pilot: one deliberately small success path, a single blind respondent per format, and a control that lacks the graph's explicit checkpoints/operation ID as well as its topology. Any difference therefore tests the *package of added information and structure*, not the graph topology in isolation. This is not a statistical model comparison. A useful next trial would hold facts constant, add a branching/failure Scenario, and test a real change or defect with observations.
