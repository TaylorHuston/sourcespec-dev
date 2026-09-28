# Todo example

A small Vite + React + TypeScript app for trying SourceSpec against real functions and UI events. Add a task, mark it complete, or remove it. Tasks live only in React state: reloading the page clears the list. There is no database, API, or browser storage.

`.sourcespecs/functions_catalog.yaml` manually records the named functions in `src/App.tsx`; it is not generated yet. `.sourcespecs/flows/add-task.yaml` describes the intended Add task behavior using `../../schema/flows.yaml`. Its `implementedBy` entries point to stable IDs in the catalog, which holds the current source locations. The links do not define the intended behavior.

Keep one flow per file under `.sourcespecs/flows/`, scoped to one trigger and its related paths. There is no fixed line limit: split a flow when it takes on a different goal or trigger, rather than collecting every journey in a hand-maintained catalog. An index can be generated later.

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` to type-check and build the app.
