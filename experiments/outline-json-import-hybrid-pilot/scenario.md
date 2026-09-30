# Experiment-only scenario: JSON archive import reaches visible completion

Evidence is the separate, unmodified Outline checkout at `05ef55e38aeb3b625e819edab907c7ee2d33af8a`. This is **not** an Outline Requirement, an observed execution trace, or a claim that the tests pass. Source paths below are relative to that checkout. The identifiers in `anchors.json` are experiment-only reviewed handles; the snapshot-index addresses they resolve to are disposable.

## GIVEN / WHEN / THEN

- **Given** an admin has selected a supported JSON-export ZIP and no import is in progress for the team, the UI's `DropToImport.handleStartImport` uploads it as a workspace-import attachment before asking the Imports model to create a JSON import (`app/scenes/Settings/components/DropToImport.tsx`).
- **When** the `imports.create` route accepts the JSON request, it authorizes creation and attachment access, and creates an Import in `Created` with the archive storage key in `scratch` (`server/routes/api/imports/imports.ts`, `server/models/Import.ts`).
- **Then** the creation event is eligible for `ImportsProcessor`: the JSON processor starts a bootstrap task, followed by page tasks; the final task runs the JSON-specific attachment finalizer before moving the Import to `Processed` (`server/queues/processors/ImportsProcessor.ts`, `JSONImportsProcessor.ts`, `server/queues/tasks/APIImportTask.ts`, `JSONAPIImportTask.ts`).
- **Then**, conditional on processing the `imports.processed` event successfully, the processor persists collections and documents and moves the Import to `Completed` (`server/queues/processors/ImportsProcessor.ts`). In the list UI, `Created`, `InProgress`, and `Processed` all display “Processing”; only `Completed` displays “Completed” (`app/scenes/Settings/components/ImportListItem.tsx`).

**Failure branch for investigation:** the task layer records an error and retries eligible failures; its failure handler can mark the Import `Errored`. The processor also stores the error and rethrows when the `imports.processed` persistence pass fails, leaving `Processed` distinct from `Completed` while retries are pending. This is a source-derived possibility, not a guarantee about live queues or timing (`server/queues/tasks/APIImportTask.ts`, `server/queues/processors/ImportsProcessor.ts`, `server/queues/index.ts`). A failed source-archive cleanup *after* completion is logged rather than undoing the completed state (`ImportsProcessor.perform`).

## Deliberately selected investigation links

| Handle | Source role (not a call-trace claim) |
| --- | --- |
| `imports-create-operation-handler` | RPC registration for `imports.create`, including the JSON/archive branch. |
| `json-import-task-bootstrap` | Reads the archive and builds the initial task wave. |
| `json-import-task-finalize-attachments` | Uploads shared attachments before `Processed`. |
| `import-task-completion-handoff` | Finishes the task wave and marks the Import `Processed`. |
| `import-processed-persistence` | Persists collections/documents and marks the Import `Completed`. |
| `import-list-status` | Renders the state as “Processing” or “Completed.” |

These six handles resolve through `anchors.json`; they are not a claim that the other thousands of functions are unimportant. The web uses the named RPC operation rather than linking directly to a sibling-app handler.

## Intended checks and gaps

- `server/queues/tasks/JSONAPIImportTask.test.ts`: “imports collections, documents and attachments from the fixture” seeds a bootstrap row, invokes task `perform` repeatedly with scheduling mocked, then calls `JSONImportsProcessor.perform` explicitly. It checks the created records, **not** the live queue or UI.
- In the same file, “completes the import when source archive cleanup fails” checks that `Completed` persists despite cleanup failure.
- `server/routes/api/imports/imports.test.ts` checks authorization and import creation, but its “should create an import” case uses **Notion**, not the JSON attachment branch.
- No checked file here establishes a live uploaded-ZIP → queued processing → displayed-status end-to-end assertion. This is a statement about inspected evidence, not proof that no such test exists elsewhere.

## Questions set before the comparison

1. The last JSON page task has completed, but the settings list still says “Processing.” Which handoffs or states should be checked first, and what evidence is still missing?
2. A proposed change moves shared attachment creation until *after* the import is marked `Processed`. Which source boundaries and intended checks need review, and what failure might now occur?

Do not infer that a listed link is an executed call, that every relevant function is linked, or that an intended check passed.
