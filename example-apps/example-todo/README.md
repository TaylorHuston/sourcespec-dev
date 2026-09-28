# Todo example

A small Vite + React + TypeScript app for trying SourceSpec against real functions and UI events. Add a task, mark it complete, or remove it. Tasks live only in React state: reloading the page clears the list. There is no database, API, or browser storage.

`.sourcespec/catalogs/functions-catalog.yaml` records the named functions in `src/App.tsx`; `.sourcespec/catalogs/tests-catalog.yaml` records the component tests in `src/App.test.tsx`. Both catalogs are hand-authored for now. `.sourcespec/flows/add-task.yaml` describes intended Add task behavior using `../../schema/flows.yaml`. Each path's `implementedBy` and `verifiedBy` entries reference catalog IDs; neither current code structure nor a test result defines the intended behavior.

Keep one flow per file under `.sourcespec/flows/`, scoped to one trigger and its related paths. There is no fixed line limit: split a flow when it takes on a different goal or trigger, rather than collecting every journey in a hand-maintained catalog. YAML filenames use kebab-case. An index can be generated later.

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Run `npm test` for the component tests and `npm run build` to type-check and build the app.
