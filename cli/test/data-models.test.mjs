import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = fileURLToPath(new URL('../', import.meta.url))
const tool = join(root, 'dist/sourcespec.js')
const YAML = createRequire(join(root, 'package.json'))('yaml')
const { schemaEnv, schemaHome } = await import('./schema-fixture.ts')

const setup = () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-data-models-'))
  const filename = join(app, 'schema.sqlite')
  const catalog = join(app, '.sourcespec/catalogs/data-model-catalog.yaml')
  mkdirSync(join(app, 'server'))
  mkdirSync(join(app, '.sourcespec/data-models'), { recursive: true })
  writeFileSync(join(app, 'server/ddl.ts'), '/* application-owned DDL */\n')
  writeFileSync(join(app, '.sourcespec/data-models/main.yaml'), `id: main
name: Main data model
description: People own tasks.
tables:
  - name: users
    purpose: Stores accounts.
    definedIn: server/ddl.ts
  - name: todos
    purpose: Stores tasks.
    definedIn: server/ddl.ts
relationships:
  - from: todos.user_id
    to: users.id
    cardinality: many-to-one
    meaning: Tasks belong to users.
    enforcedBy: foreign-key
`)
  const db = new DatabaseSync(filename)
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL);
    CREATE TABLE todos (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    CREATE INDEX todos_by_user ON todos(user_id);`)
  db.prepare('INSERT INTO users VALUES (?, ?)').run('sensitive-id', 'private-username')
  db.close()
  const run = (action, args = []) => spawnSync(process.execPath,
    [tool, 'sspc-data-models', action, '--app', app, '--sqlite', filename, ...args],
    { encoding: 'utf8', env: schemaEnv })
  return { app, filename, catalog, run }
}

test('inventories disposable SQLite structure without data rows and validates authored maps', () => {
  const { app, filename, catalog, run } = setup()
  try {
    const probe = run('probe')
    assert.equal(probe.status, 0, probe.stderr)
    assert.match(probe.stdout, /2 table\(s\), 5 column\(s\), 1 foreign key\(s\), 4 index\(es\)/)
    assert.equal(existsSync(catalog), false)
    assert.notEqual(run('check').status, 0, 'missing catalog needs a write')
    const write = run('write')
    assert.equal(write.status, 0, write.stderr)
    const text = readFileSync(catalog, 'utf8')
    assert(!text.includes('private-username') && !text.includes('sensitive-id'), 'data rows must never be recorded')
    const tables = YAML.parse(text).tables
    assert.deepEqual(tables.map((entry) => entry.id), ['table:sqlite/todos', 'table:sqlite/users'])
    assert(tables.find((entry) => entry.name === 'todos').columns.some((column) =>
      column.id === 'column:sqlite/todos#user_id'))
    assert(tables.find((entry) => entry.name === 'todos').indexes.some((index) => index.id === 'index:sqlite/todos_by_user'))
    assert.equal(run('check').status, 0)
    assert.equal(run('check', ['--force']).status, 2, '--force is write-only')
    const db = new DatabaseSync(filename)
    db.exec('ALTER TABLE todos ADD COLUMN note TEXT')
    db.close()
    assert.notEqual(run('check').status, 0, 'a column addition makes the catalog stale')
    assert.equal(run('write').status, 0, 'normal write accepts an additive change')
    assert.equal(run('check').status, 0)
    const before = readFileSync(catalog, 'utf8')
    const map = join(app, '.sourcespec/data-models/main.yaml')
    writeFileSync(map, readFileSync(map, 'utf8').replace('to: users.id', 'to: users.missing'))
    assert.match(run('check').stderr, /unknown or ambiguous relationship/)
    assert.equal(readFileSync(catalog, 'utf8'), before)
    assert.notEqual(run('write', ['--force']).status, 0, 'force cannot bypass a broken authored map')
    assert.equal(readFileSync(catalog, 'utf8'), before)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('normal writes refuse removed identities; force replaces only after map review', () => {
  const { app, filename, catalog, run } = setup()
  try {
    assert.equal(run('write').status, 0)
    const original = readFileSync(catalog, 'utf8')
    const db = new DatabaseSync(filename)
    db.exec('DROP INDEX todos_by_user')
    db.close()
    const refused = run('write')
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /Unmatched prior data-model IDs/)
    assert.equal(readFileSync(catalog, 'utf8'), original)
    const forced = run('write', ['--force'])
    assert.equal(forced.status, 0, forced.stderr)
    assert.match(forced.stderr, /old IDs will be lost/)
    assert(!readFileSync(catalog, 'utf8').includes('index:sqlite/todos_by_user'))
    assert.equal(run('check').status, 0)
    const db2 = new DatabaseSync(filename)
    db2.exec('CREATE VIEW task_count AS SELECT COUNT(*) FROM todos')
    db2.close()
    assert.match(run('probe').stderr, /Unsupported SQLite schema object/)
    assert.equal(readFileSync(catalog, 'utf8').includes('index:sqlite/todos_by_user'), false)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('read-only input never creates a database and installed schema governs validation', () => {
  const { app, filename, catalog, run } = setup()
  try {
    rmSync(filename)
    assert.notEqual(run('probe').status, 0)
    assert.equal(existsSync(filename), false)
    const db = new DatabaseSync(filename)
    db.exec('CREATE TABLE only (id TEXT PRIMARY KEY)')
    db.close()
    assert.equal(run('write').status, 1, 'the authored map does not resolve against a different schema')
    assert.equal(existsSync(catalog), false)
    const schema = join(schemaHome, '.sourcespec/schema/data-model-catalog.yaml')
    const original = readFileSync(schema, 'utf8')
    writeFileSync(schema, original.replace('required: [engine, tables]', 'required: [engine, tables, appLocalOnly]'))
    assert.notEqual(run('probe').status, 0)
    writeFileSync(schema, original)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('rejects virtual tables despite SQL comments and rejects triggers', () => {
  const { app, filename, run } = setup()
  try {
    const db = new DatabaseSync(filename)
    db.exec('CREATE VIRTUAL /* SQL comment */ TABLE search USING fts5(text)')
    db.close()
    assert.match(run('probe').stderr, /Unsupported SQLite schema object.*search/)
    const db2 = new DatabaseSync(filename)
    db2.exec('DROP TABLE search; CREATE TRIGGER renamed AFTER INSERT ON todos BEGIN SELECT 1; END')
    db2.close()
    assert.match(run('check').stderr, /Unsupported SQLite schema object.*renamed/)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('rejects symlinked catalog and DDL directories outside the app', () => {
  const { app, catalog, run } = setup()
  const external = mkdtempSync(join(tmpdir(), 'sspc-data-external-'))
  try {
    symlinkSync(external, join(app, '.sourcespec/catalogs'))
    assert.match(run('write').stderr, /not a real directory/)
    assert.equal(existsSync(join(external, 'data-model-catalog.yaml')), false)
    rmSync(join(app, '.sourcespec/catalogs'))
    assert.equal(run('write').status, 0)
    const before = readFileSync(catalog, 'utf8')
    writeFileSync(join(external, 'ddl.ts'), '/* unrelated */\n')
    symlinkSync(external, join(app, 'linked'))
    const model = join(app, '.sourcespec/data-models/main.yaml')
    writeFileSync(model, readFileSync(model, 'utf8').replaceAll('server/ddl.ts', 'linked/ddl.ts'))
    assert.match(run('check').stderr, /not a real directory|outside-app DDL source/)
    assert.equal(readFileSync(catalog, 'utf8'), before)
  } finally {
    rmSync(app, { recursive: true, force: true })
    rmSync(external, { recursive: true, force: true })
  }
})

test('quotes SQLite identifiers from schema metadata', () => {
  const { app, filename, catalog, run } = setup()
  try {
    const db = new DatabaseSync(filename)
    db.exec('CREATE TABLE "quoted""table" ("quoted""column" TEXT); CREATE INDEX "quoted""index" ON "quoted""table"("quoted""column")')
    db.close()
    assert.equal(run('write').status, 0)
    const text = readFileSync(catalog, 'utf8')
    assert(text.includes('table:sqlite/quoted%22table'))
    assert(text.includes('index:sqlite/quoted%22index'))
    assert.equal(run('check').status, 0)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
