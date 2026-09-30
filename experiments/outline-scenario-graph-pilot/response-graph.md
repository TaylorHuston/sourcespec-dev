# Blind respondent — graph.json

Read only `graph.json`; fresh-context `sdd-reviewer` profile, default model and high thinking, no inherited context, one file-read tool call. Response below is verbatim.

1. **Last page finished; list says Processing**
   - **First boundary:** `task-handoff` after the final page task (`t03b` → `t05`): confirm no `Created` task remained and that final-task handling began.
   - **Follow-ups:** `finalize-attachments` (`t05` → `t06`), `processed`/display (`t07`), processed-event delivery to `persist` (`t08`), then either completion (`t12` → `cleanup` → `t13`) or retry/error (`t09`–`t11`).
   - **Distinguishing observation:** a row sourced from durable `Processed` is expected to render **Processing** (`processed`, `display`); a genuinely stuck import would have no subsequent durable transition to `Completed` or `Errored` after the processed-event persistence path is delivered/attempted.
   - **Unknowns:** the graph does not prove event delivery, attempts, timings, or the client refresh/update mechanism. It cannot establish that the displayed row reflects current durable state.

2. **Move attachment rows/blobs until after `Processed`**
   - **Required review order:** current final-task boundary `task-handoff` → `finalize-attachments` (`t05`), the `Processed` transition (`t06`), processed-event handoff (`t08`), then `persist`, which explicitly uses attachment rows while rewriting persisted content, before `Completed` (`t12`).
   - **Concrete failure mode:** `persist` runs after `Processed` without attachment rows/blobs available, so content rewriting fails; this can enter `retry` (`t09`/`t10`) and potentially `errored` (`t11`).
   - **Intended checks:** `json-fixture` (“imports collections, documents and attachments from the fixture”) is relevant, but its stated limit is mocked scheduling plus a direct processed-handler call. `cleanup-failure` only covers archive-deletion failure after completion.
   - **Test gap:** no listed intended check verifies the proposed ordering—`Processed` emitted before attachment finalization—and successful persistence with attachment-dependent rewrites under that ordering. None is evidence of passing.

3. **`Completed` persisted; source archive removal failed; UI says Processing**
   - **Focus:** the post-completion `persist` → `cleanup` boundary (`t12`/`t13`), then the client display-refresh boundary.
   - **Relevant intended check:** `cleanup-failure`, declared as “completes the import when source archive cleanup fails”; its limit says it checks persisted `Completed`, not the displayed list.
   - **Rollback:** no. The candidate states cleanup failure is logged without reverting `Completed` (`cleanup`, `t13`).
   - **Durable vs. client state:** `Completed` persistence is the durable state; a list still showing Processing is a refresh/update concern. The client path supplying that row is explicitly unmodeled, so the artifact cannot explain why it failed to refresh.

4. **Limits of this document**
   - It cannot prove an executed path, delivered event, or passing test: its authority explicitly calls it an authored navigation map, not an execution trace or verified requirement.
   - It cannot identify the exact production fault; function links are opaque IDs and the graph does not contain runtime evidence.
   - It cannot enumerate every relevant function or test. The listed checks are expressly not a complete test catalog, and the graph names unmodeled surfaces: live queue/event delivery and client list refresh/update.
