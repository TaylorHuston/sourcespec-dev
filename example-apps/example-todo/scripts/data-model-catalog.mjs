import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openTodoStore } from '../server/todo-store.ts'

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const action = process.argv[2]
if (!['probe', 'write', 'check'].includes(action) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/data-model-catalog.mjs probe|write|check')
}
const directory = mkdtempSync(join(tmpdir(), 'sourcespec-todo-schema-'))
try {
  const filename = join(directory, 'schema.sqlite')
  openTodoStore(filename).close()
  execFileSync(process.execPath, [join(appRoot, '../../cli/dist/sourcespec.js'), 'sspc-data-models', action,
    '--app', appRoot, '--sqlite', filename], { stdio: 'inherit' })
} finally {
  rmSync(directory, { recursive: true, force: true })
}
