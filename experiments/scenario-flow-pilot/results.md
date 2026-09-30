# One-Scenario blind comparison — 2026-09-29

## Setup

`flat.yaml` is a verbatim snapshot of the current `add-task` / `task-added` Scenario, wrapped in a one-Scenario document. `graph.yaml` preserves the same Requirement, GIVEN/WHEN/THEN statements, and intended test links; it adds six ordered checkpoints, the `createTodo` operation handoff, and checkpoint expectations. Both are experiment-only, not canonical `.sourcespec/` records. The four questions and evaluation anchors were written in `questions.md` **before** the blind runs.

Two independent, fresh-context `general-purpose` agents (default model, requested low thinking; no inherited context) received only their assigned YAML and identical questions. Both were instructed not to inspect files or use tools; neither used a tool. These are individual LLM responses, not independent code verification.

## Flat Scenario response (verbatim)

1. **First:** `add-task-submission`—check whether it handles the successful response by displaying the saved task and clearing the draft. **Next:** check `todo-interface` for list and count rendering, then `client-create-task` for response handling; `add-task-trims-input` is the relevant intended UI test. **Unknown:** a successful response does not prove the UI updated, that the task survives reload, or exactly which code is broken.

2. **First:** check `todo-interface`, which loads saved tasks on reload. **Next:** trace `local-api-handler` (session and request routing) and `store-create-task` (SQLite insertion for the signed-in user). Relevant intended tests are `api-validates-and-persists-tasks` and `sqlite-tasks-survive-reopen`. **Unknown:** the YAML does not map a specific reload request or read-side API/store function, and it does not establish that either test passed.

3. **First:** review the create-request boundary between `client-create-task` and `local-api-handler`, then `store-create-task` to ensure raw non-blank drafts are validated and saved trimmed. **Next:** review `add-task-submission` and `todo-interface` against the `task-added` outcomes: trimmed, incomplete task displayed; count increased; field cleared after success; task retained after reload. Review intended tests `add-task-trims-input` (its client-trimming expectation would need changing), `api-validates-and-persists-tasks`, and `sqlite-tasks-survive-reopen`. **Unknown:** this one Scenario cannot fully enumerate blank-input, failed-save, or other affected behavior and tests.

4. **No.** Case 1’s observation narrows the first investigation point but does not identify the broken code. For case 3, the YAML lists linked functions and intended tests for `task-added`, not an exhaustive inventory of every function or test the change could affect.

## Authored-graph response (verbatim)

1. **First:** inspect `respond → display`, especially `add-task-submission` and `todo-interface`: was the successful `createTodo` result applied to the list, count, and draft field? **Next:** check `request` / `client-create-task` for how it awaits and returns that result. **Relevant IDs:** `respond`, `display`, `add-task-submission`, `todo-interface`, `client-create-task`, `add-task-trims-input`. **Unknown:** a successful response does not prove the UI handled it, the draft was trimmed, or persistence survives a reload. It does not identify the broken code.

2. **First:** check `persist` / `store-create-task` for an owner-scoped saved record with trimmed text. **Next:** check `accept` and `respond` / `local-api-handler` to distinguish a saved response from a merely visible task. **Relevant intended tests:** `api-validates-and-persists-tasks`, `sqlite-tasks-survive-reopen`; `add-task-trims-input` covers the immediate UI outcome. **Unknown:** none of those tests is shown to have passed. The YAML does not map the reload/read operation or the function that repopulates the list.

3. **First:** review `submit` / `add-task-submission` and `request` / `client-create-task`, whose expectations currently require client-side trimming. **Next:** review `accept` / `local-api-handler` for raw-input validation and `persist` / `store-create-task` for saving trimmed text; then check `respond → display` for the saved task, count, and cleared field. **Relevant intended tests:** `add-task-trims-input`, `api-validates-and-persists-tasks`, and `sqlite-tasks-survive-reopen` for durable contents. **Unknown:** this single success Scenario does not fully enumerate blank-input or failed-save paths, despite their mention in `requirement`, or all affected functions and tests.

4. **No.** Case 1 narrows investigation to the response-to-display path but cannot identify exact broken code. Case 3 has the listed checkpoints, linked functions, and intended tests—not an exhaustive implementation or test inventory. The YAML is an authored map, not a runtime trace or proof of passing tests.

## Comparison against the pre-registered criteria

| Question | Observation |
| --- | --- |
| 1. Successful response but stale UI | Both pointed first to UI handling and the same relevant function/test IDs. The graph named `respond → display` as a precise boundary; the flat record gave an equally actionable first function. Neither invented a proven root cause. |
| 2. Missing after reload | The flat record surfaced `todo-interface`'s loading role immediately. The graph started at `persist`, then correctly called out its unmapped reload/read path. The graph did **not** improve reload localization; it lost a useful role when it replaced the flat list. |
| 3. Move trimming to API | Both found the client/API/storage/test surfaces and noticed `add-task-trims-input` must be reconsidered. The graph made the client-to-operation-to-API order explicit, but did not reveal additional affected tests or cases. |
| 4. Completeness limits | Both refused to claim exact root cause, exhaustive call coverage, or passing tests. No observed increase in overconfidence from the graph. |

**Result:** This trial did not demonstrate a decisive debugging or impact-analysis advantage over the existing flat Scenario. The graph made a handoff and response-to-display boundary easier to name, but the flat record was already effective and was better at highlighting the reload UI role. The graph is 81 lines / 388 words versus 33 lines / 244 words for the control, with repeated `implementedBy` references and a success-path-only model. The missing reload path is a concrete gap to resolve if authored flow becomes the Scenario format.

This is one small success case with one LLM response per format. The graph adds factual checkpoint detail and an operation ID, not just a different shape, so its effect cannot be isolated from its additional content. No live defect was reproduced and no response establishes that the modeled path matches a runtime trace. A stronger follow-up would hold the facts constant, compare a failure/branching Scenario, and use observed failures or real change diffs with a measured answer key. No canonical schema or Requirement was changed.
