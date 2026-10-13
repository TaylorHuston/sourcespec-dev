import { isDeepStrictEqual } from 'node:util'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { Ajv2020 } from 'ajv/dist/2020.js'
import YAML from 'yaml'
import { readInstalledSchema } from './schema.js'

type Column = { id: string; name: string; type: string; notNull: boolean; primaryKeyPosition: number; hidden: number; defaultValue: string | null }
type ForeignKey = { from: string[]; toTable: string; to: (string | null)[]; onUpdate: string; onDelete: string }
type Index = { id: string; name: string; unique: boolean; origin: string; partial: boolean; ddl: string | null; columns: { name: string | null; descending: boolean; collation: string }[] }
type Table = { id: string; name: string; ddl: string; columns: Column[]; foreignKeys: ForeignKey[]; indexes: Index[] }
type Catalog = { engine: 'sqlite'; tables: Table[] }
type Model = {
  id: string
  tables: { name: string; definedIn: string }[]
  relationships: { from: string; to: string; enforcedBy: 'foreign-key' | 'application' }[]
}

const [appFlag, appPath, sqliteFlag, sqlitePath, forceOption, mode] = process.argv.slice(2)
const force = forceOption === '--force' && mode === '--write' && process.argv.length === 8
const ordinary = mode === undefined && ['--probe', '--write', '--check'].includes(forceOption ?? '') && process.argv.length === 7
if (appFlag !== '--app' || sqliteFlag !== '--sqlite' || !appPath || !sqlitePath ||
    !isAbsolute(appPath) || !isAbsolute(sqlitePath) || (!ordinary && !force)) {
  throw new Error('Usage: sourcespec sspc-data-models probe|write|check --app <absolute-app-root> --sqlite <absolute-disposable-schema-db> [--force for write]')
}
const action = ordinary ? forceOption : mode
const appRoot = realpathSync(appPath)
if (!lstatSync(appRoot).isDirectory() || !lstatSync(sqlitePath).isFile()) {
  throw new Error('--app must be a directory and --sqlite must be an existing regular database file (not a symlink)')
}
const databasePath = realpathSync(sqlitePath)
const catalogPath = join(appRoot, '.sourcespec/catalogs/data-model-catalog.yaml')
function ownedDirectory(path: string, create = false): boolean {
  const rel = relative(appRoot, path)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`Directory is outside the app: ${path}`)
  let directory = appRoot
  for (const part of rel.split(sep)) {
    directory = join(directory, part)
    const stat = lstatSync(directory, { throwIfNoEntry: false })
    if (!stat) {
      if (!create) return false
      mkdirSync(directory)
    } else if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Refusing an app directory that is not a real directory: ${directory}`)
    }
  }
  return true
}
function ownedFile(path: string): boolean {
  if (!ownedDirectory(dirname(path))) return false
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (!stat) return false
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing an app file that is not a regular file: ${path}`)
  return true
}
const validateCatalog = new Ajv2020({ allErrors: true }).compile(readInstalledSchema('data-model-catalog'))
const validateModel = new Ajv2020({ allErrors: true }).compile(readInstalledSchema('data-models'))
const segment = (name: string) => encodeURIComponent(name).replace(/\./g, '%2E')
const tableId = (name: string) => `table:sqlite/${segment(name)}`
const columnId = (table: string, name: string) => `column:sqlite/${segment(table)}#${segment(name)}`
const indexId = (name: string) => `index:sqlite/${segment(name)}`
const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`

const db = new DatabaseSync(databasePath, { readOnly: true })
let current: Catalog
try {
  const objects = db.prepare("SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table', 'index', 'view', 'trigger') ORDER BY name")
    .all() as { name: string; type: string; sql: string | null }[]
  const virtualNames = new Set((db.prepare('PRAGMA table_list').all() as { schema: string; name: string; type: string }[])
    .filter((entry) => entry.schema === 'main' && entry.type === 'virtual').map((entry) => entry.name))
  const unsupported = objects.filter((entry) => !entry.name.startsWith('sqlite_') &&
    (entry.type === 'view' || entry.type === 'trigger' || virtualNames.has(entry.name)))
  if (unsupported.length) throw new Error(`Unsupported SQLite schema object(s): ${unsupported.map((entry) => `${entry.type} ${entry.name}`).join(', ')}. Review before inventorying; no objects are silently skipped.`)
  const tableObjects = objects.filter((entry) => entry.type === 'table' && !entry.name.startsWith('sqlite_'))
  if (!tableObjects.length) throw new Error('No user tables in the supplied SQLite database')
  const tables: Table[] = tableObjects.map((entry) => {
    const columnRows = db.prepare(`PRAGMA table_xinfo(${quoted(entry.name)})`).all() as {
      name: string; type: string; notnull: number; pk: number; hidden: number; dflt_value: string | null
    }[]
    const columns: Column[] = columnRows.map((row) => ({
      id: columnId(entry.name, row.name), name: row.name, type: row.type,
      notNull: row.notnull !== 0, primaryKeyPosition: row.pk, hidden: row.hidden, defaultValue: row.dflt_value,
    }))
    const fkRows = db.prepare(`PRAGMA foreign_key_list(${quoted(entry.name)})`).all() as {
      id: number; seq: number; table: string; from: string; to: string | null; on_update: string; on_delete: string
    }[]
    const groups = new Map<number, typeof fkRows>()
    for (const row of fkRows) groups.set(row.id, [...(groups.get(row.id) ?? []), row])
    const foreignKeys: ForeignKey[] = [...groups].sort(([a], [b]) => a - b).map(([, rows]) => {
      rows.sort((a, b) => a.seq - b.seq)
      return { from: rows.map((row) => row.from), toTable: rows[0].table,
        to: rows.map((row) => row.to), onUpdate: rows[0].on_update, onDelete: rows[0].on_delete }
    })
    const indexRows = db.prepare(`PRAGMA index_list(${quoted(entry.name)})`).all() as {
      name: string; unique: number; origin: string; partial: number
    }[]
    const indexes: Index[] = indexRows.sort((a, b) => a.name.localeCompare(b.name)).map((row) => {
      const indexColumns = db.prepare(`PRAGMA index_xinfo(${quoted(row.name)})`).all() as {
        name: string | null; desc: number; coll: string; key: number
      }[]
      return { id: indexId(row.name), name: row.name, unique: row.unique !== 0,
        origin: row.origin, partial: row.partial !== 0,
        ddl: objects.find((object) => object.type === 'index' && object.name === row.name)?.sql ?? null,
        columns: indexColumns.filter((column) => column.key === 1).map((column) => ({
          name: column.name, descending: column.desc !== 0, collation: column.coll,
        })) }
    })
    return { id: tableId(entry.name), name: entry.name, ddl: entry.sql ?? '', columns, foreignKeys, indexes }
  })
  current = { engine: 'sqlite', tables }
} finally {
  db.close()
}
if (!validateCatalog(current)) throw new Error(`Invalid generated data-model catalog: ${JSON.stringify(validateCatalog.errors)}`)

function readCatalog(): Catalog | null {
  if (!ownedFile(catalogPath)) return null
  const value: unknown = YAML.parse(readFileSync(catalogPath, 'utf8'))
  if (!validateCatalog(value)) throw new Error(`Invalid existing data-model catalog: ${JSON.stringify(validateCatalog.errors)}`)
  const prior = value as Catalog
  for (const table of prior.tables) {
    if (table.id !== tableId(table.name) || table.columns.some((column) => column.id !== columnId(table.name, column.name)) ||
        table.indexes.some((index) => index.id !== indexId(index.name))) {
      throw new Error(`Invalid data-model identity in ${table.name}; review existing IDs and authored links`)
    }
  }
  const ids = prior.tables.flatMap((table) => [table.id, ...table.columns.map((column) => column.id), ...table.indexes.map((index) => index.id)])
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate data-model catalog identity')
  return prior
}
function checkModels(): number {
  const directory = join(appRoot, '.sourcespec/data-models')
  if (!ownedDirectory(directory)) return 0
  const files = readdirSync(directory).filter((name) => name.endsWith('.yaml')).sort()
  const names = new Set(current.tables.map((table) => table.name))
  const ids = new Set<string>()
  for (const file of files) {
    if (!ownedFile(join(directory, file))) throw new Error(`${file}: missing authored data-model file`)
    const value: unknown = YAML.parse(readFileSync(join(directory, file), 'utf8'))
    if (!validateModel(value)) throw new Error(`${file}: invalid authored data model: ${JSON.stringify(validateModel.errors)}`)
    const model = value as Model
    if (ids.has(model.id)) throw new Error(`${file}: duplicate data-model ID ${model.id}`)
    ids.add(model.id)
    const modelTables = new Set<string>()
    for (const table of model.tables) {
      if (modelTables.has(table.name) || !names.has(table.name)) throw new Error(`${file}: duplicate or unknown table ${table.name}`)
      modelTables.add(table.name)
      const path = resolve(appRoot, table.definedIn)
      if (isAbsolute(table.definedIn) || !ownedFile(path) ||
          realpathSync(path) !== path) {
        throw new Error(`${file}: missing or outside-app DDL source ${table.definedIn}`)
      }
    }
    for (const link of model.relationships) {
      const matches = (ref: string) => current.tables.flatMap((table) => table.columns
        .filter((column) => ref === `${table.name}.${column.name}`).map((column) => ({ table: table.name, column: column.name })))
      const from = matches(link.from)
      const to = matches(link.to)
      if (from.length !== 1 || to.length !== 1 || !modelTables.has(from[0].table) || !modelTables.has(to[0].table)) {
        throw new Error(`${file}: unknown or ambiguous relationship ${link.from} -> ${link.to}`)
      }
      if (link.enforcedBy === 'foreign-key') {
        const owner = current.tables.find((table) => table.name === from[0].table)!
        if (!owner.foreignKeys.some((fk) => fk.toTable === to[0].table &&
            fk.from.some((column, i) => column === from[0].column && fk.to[i] === to[0].column))) {
          throw new Error(`${file}: relationship ${link.from} -> ${link.to} has no corresponding SQLite foreign key`)
        }
      }
    }
  }
  return files.length
}

if (action === '--probe') {
  console.log(`Probe: ${current.tables.length} table(s), ${current.tables.reduce((count, table) => count + table.columns.length, 0)} column(s), ${current.tables.reduce((count, table) => count + table.foreignKeys.length, 0)} foreign key(s), ${current.tables.reduce((count, table) => count + table.indexes.length, 0)} index(es).`)
  console.log(`Tables: ${current.tables.map((table) => table.name).join(', ')}. Catalog not written.`)
} else {
  const prior = force ? null : readCatalog()
  const modelCount = checkModels()
  const oldIds = prior?.tables.flatMap((table) => [table.id, ...table.columns.map((column) => column.id), ...table.indexes.map((index) => index.id)]) ?? []
  const newIds = new Set(current.tables.flatMap((table) => [table.id, ...table.columns.map((column) => column.id), ...table.indexes.map((index) => index.id)]))
  const missing = oldIds.filter((id) => !newIds.has(id))
  if (missing.length) throw new Error(`Unmatched prior data-model IDs: ${missing.join(', ')}. Review removed/renamed objects and authored links before replacement.`)
  if (action === '--check') {
    if (!prior || !isDeepStrictEqual(prior, current)) {
      throw new Error('Data-model catalog is missing or stale. Review schema changes before a write.')
    }
    console.log(`Data-model catalog matches ${current.tables.length} SQLite tables; ${modelCount} authored map(s) resolve.`)
  } else {
    if (force && ownedFile(catalogPath)) console.warn('Replacing the data-model catalog; old IDs will be lost. Review authored links separately.')
    ownedDirectory(dirname(catalogPath), true)
    ownedFile(catalogPath)
    const temporary = `${catalogPath}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, '# Generated SQLite structure, not data rows. DDL and authored meanings live elsewhere.\n' +
        YAML.stringify(current, { lineWidth: 110 }), { flag: 'wx' })
      renameSync(temporary, catalogPath)
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary)
    }
    console.log(`Wrote ${current.tables.length} SQLite tables; ${modelCount} authored map(s) resolve.`)
  }
}
