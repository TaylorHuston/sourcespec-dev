import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
import { openTodoStore } from './todo-store.ts'

const modelFile = fileURLToPath(new URL('../.sourcespec/data-models/local-todo.yaml', import.meta.url))
const appRoot = fileURLToPath(new URL('../', import.meta.url))

it('maps every documented table and relationship to SQLite foreign keys', () => {
  const model = parse(readFileSync(modelFile, 'utf8')) as {
    tables: { name: string; definedIn: string }[]
    relationships: { from: string; to: string; enforcedBy: string }[]
  }
  const directory = mkdtempSync(join(tmpdir(), 'sourcespec-model-'))
  const filename = join(directory, 'todos.sqlite')
  const store = openTodoStore(filename)
  store.close()
  const db = new DatabaseSync(filename)
  try {
    const actual = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all().map((row) => row.name).sort()
    expect(model.tables.map((table) => table.name).sort()).toEqual(actual)
    for (const table of model.tables) expect(table.definedIn).toBe('server/todo-store.ts')
    const actualRelations = model.tables.flatMap((table) => db.prepare(`PRAGMA foreign_key_list(${table.name})`).all()
      .map((row) => `${table.name}.${row.from}->${row.table}.${row.to}`)).sort()
    expect(model.relationships.map((link) => `${link.from}->${link.to}`).sort()).toEqual(actualRelations)
    expect(model.relationships.every((link) => link.enforcedBy === 'foreign-key')).toBe(true)
  } finally {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('resolves data-model representations to TypeScript and OpenAPI definitions', () => {
  const model = parse(readFileSync(modelFile, 'utf8')) as {
    representations: { kind: 'typescript' | 'openapi'; reference: string }[]
  }
  const api = parse(readFileSync(join(appRoot, 'openapi.yaml'), 'utf8')) as {
    components: { schemas: Record<string, unknown> }
  }
  for (const entry of model.representations) {
    if (entry.kind === 'openapi') {
      expect(entry.reference.startsWith('#/components/schemas/')).toBe(true)
      expect(api.components.schemas[entry.reference.slice('#/components/schemas/'.length)]).toBeTruthy()
    } else {
      const [file, symbol] = entry.reference.split('#')
      expect(symbol).toMatch(/^[A-Za-z][A-Za-z0-9]*$/)
      expect(readFileSync(join(appRoot, file), 'utf8')).toContain(`export type ${symbol} =`)
    }
  }
})
