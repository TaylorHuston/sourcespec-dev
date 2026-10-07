import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readInstalledSchema } from './schema.js'
import { Ajv2020 } from 'ajv/dist/2020.js'
import ts from 'typescript'
import YAML from 'yaml'

type TestRecord = {
  id: string
  name: string
  suite?: string[]
  description: string
  kind: string
  location: string
}
type Declaration = { name: string; suite: string[]; location: string; inferredKind: string }
type Callee = { root: 'test' | 'describe'; each: boolean; bound: boolean }

const [appFlag, appPath, ...options] = process.argv.slice(2)
const mode = options.at(-1)
const force = mode === '--write' && options.at(-2) === '--force'
if (appFlag !== '--app' || !appPath || !['--check', '--write'].includes(mode ?? '') ||
    options.length !== (force ? 2 : 1)) {
  throw new Error('Usage: sourcespec sspc-tests check|write --app <absolute-app-root> [--force for write]')
}
if (appPath !== resolve(appPath)) throw new Error('--app must be an absolute path')
const appRoot = realpathSync(appPath)
if (!existsSync(join(appRoot, 'package.json')) || !existsSync(join(appRoot, 'tsconfig.json')) ||
    existsSync(join(appRoot, 'pnpm-workspace.yaml'))) {
  throw new Error('--app needs a single application root with package.json and tsconfig.json')
}

const catalogFile = join(appRoot, '.sourcespec/catalogs/tests-catalog.yaml')
const validate = new Ajv2020({ allErrors: true }).compile(readInstalledSchema('tests'))
const identity = (entry: Pick<TestRecord, 'location' | 'suite' | 'name'>) =>
  JSON.stringify([entry.location, entry.suite ?? [], entry.name])
const lexicalSegment = (text: string) => text.normalize('NFKC').replace(/[^A-Za-z0-9_$.-]+/g, '-')
  .replace(/^[.-]+|[.-]+$/g, '') || 'unnamed'
const lexicalId = (entry: Pick<TestRecord, 'location' | 'suite' | 'name'>) =>
  `test:${entry.location.split('/').map(lexicalSegment).join('/')}#${[...(entry.suite ?? []), entry.name].map(lexicalSegment).join('.')}`

function readCatalog(): TestRecord[] {
  if (!existsSync(catalogFile)) return []
  const document: unknown = YAML.parse(readFileSync(catalogFile, 'utf8'))
  if (!document || typeof document !== 'object' || !('tests' in document) ||
      !Array.isArray(document.tests)) throw new Error('Expected a tests array in the existing catalog')
  const ids = new Set<string>()
  const identities = new Set<string>()
  for (const entry of document.tests) {
    if (!validate(entry)) throw new Error(`Invalid catalog test: ${JSON.stringify(validate.errors)}`)
    const record = entry as TestRecord
    if (!record.location) throw new Error(`Existing test ${record.id} has no source location; reconcile it before refreshing`)
    if (record.id !== lexicalId(record)) {
      throw new Error(`Test identity changed for ${record.location} (${record.name}): ${record.id} -> ${lexicalId(record)}. Review intended-check links before replacing the catalog.`)
    }
    if (ids.has(record.id)) throw new Error(`Duplicate test ID: ${record.id}`)
    if (identities.has(identity(record))) throw new Error(`Ambiguous existing test identity: ${identity(record)}`)
    ids.add(record.id)
    identities.add(identity(record))
  }
  return document.tests as TestRecord[]
}

const ignored = new Set(['.git', '.sourcespec', '.data', '.next', '.turbo', 'node_modules',
  'dist', 'build', 'coverage', 'storybook-static', 'test-results', 'playwright-report'])
const testFile = (path: string) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
  /(?:^|\/)(?:__tests__|tests?)\//.test(path)
function testFiles(directory = appRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : testFiles(path)
    if (!entry.isFile() || /\.d\.[cm]?ts$/.test(entry.name)) return []
    const location = relative(appRoot, path)
    return /\.[cm]?[jt]sx?$/.test(path) && testFile(location) ? [path] : []
  }).sort()
}

const modifiers = new Set(['only', 'skip', 'todo', 'concurrent', 'sequential', 'failing'])
function calleeFor(expression: ts.Expression, aliases: Map<string, Callee['root']>): Callee | null {
  if (ts.isIdentifier(expression)) {
    const root = aliases.get(expression.text)
    return root ? { root, each: false, bound: true } : null
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const base = calleeFor(expression.expression, aliases)
    if (!base) return null
    if (expression.name.text === 'each' && !base.each) return { ...base, each: true, bound: false }
    if (modifiers.has(expression.name.text) && base.bound) return base
    return null
  }
  if (ts.isCallExpression(expression) || ts.isTaggedTemplateExpression(expression)) {
    const factory = calleeFor(ts.isCallExpression(expression) ? expression.expression : expression.tag, aliases)
    return factory?.each && !factory.bound ? { ...factory, bound: true } : null
  }
  return null
}

function aliasesFor(source: ts.SourceFile): Map<string, Callee['root']> {
  const aliases = new Map<string, Callee['root']>([['it', 'test'], ['test', 'test'], ['describe', 'describe']])
  const providers = new Set(['vitest', '@jest/globals', 'node:test', 'bun:test'])
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const named = statement.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const element of named.elements) {
      const original = element.propertyName?.text ?? element.name.text
      const local = element.name.text
      if (!['it', 'test', 'describe'].includes(original)) continue
      if (providers.has(statement.moduleSpecifier.text)) {
        aliases.set(local, original === 'describe' ? 'describe' : 'test')
      } else {
        aliases.delete(local) // Another module's `test` is not automatically a test runner.
      }
    }
  }
  return aliases
}

// Adapter-local evidence, not a universal test taxonomy: only classify when the
// declaration body invokes a known boundary. Importing a package alone is insufficient.
function boundaryCalls(source: ts.SourceFile): { component: Set<string>; api: Set<string> } {
  const component = new Set<string>()
  const api = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const module = statement.moduleSpecifier.text
    const named = statement.importClause?.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        const imported = element.propertyName?.text ?? element.name.text
        if ((module === '@testing-library/react' && ['render', 'renderHook'].includes(imported)) ||
            (module === 'react-dom/server' && ['renderToStaticMarkup', 'renderToString'].includes(imported))) {
          component.add(element.name.text)
        }
      }
    }
    if (module === 'supertest' && statement.importClause?.name) api.add(statement.importClause.name.text)
  }
  return { component, api }
}

function kindFor(call: ts.CallExpression, boundaries: ReturnType<typeof boundaryCalls>): string {
  const body = call.arguments[1]
  if (!body) return 'unclassified'
  let component = false
  let api = false
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (boundaries.component.has(node.expression.text)) component = true
      if (boundaries.api.has(node.expression.text)) api = true
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return component === api ? 'unclassified' : component ? 'component' : 'api'
}

function titleFor(call: ts.CallExpression, source: ts.SourceFile): string {
  const title = call.arguments[0]
  if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title)) && title.text.trim()) {
    return title.text
  }
  const { line } = source.getLineAndCharacterOfPosition(call.getStart(source))
  throw new Error(`Nonliteral or empty test/suite name at ${relative(appRoot, source.fileName)}:${line + 1}; review and use an explicit static name`)
}

const previous = force ? [] : readCatalog()
const prior = new Map(previous.map((entry) => [identity(entry), entry]))
const declarations: Declaration[] = []
const files = testFiles()
for (const file of files) {
  const location = relative(appRoot, file)
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    /\.[cm]?[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const aliases = aliasesFor(source)
  const boundaries = boundaryCalls(source)
  function suitesFor(node: ts.Node): string[] {
    const suites: string[] = []
    let child: ts.Node = node
    for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
      if (!ts.isCallExpression(parent) || !parent.arguments.includes(child as ts.Expression)) continue
      const callee = calleeFor(parent.expression, aliases)
      if (callee?.root === 'describe' && callee.bound) suites.unshift(titleFor(parent, source))
    }
    return suites
  }
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = calleeFor(node.expression, aliases)
      if (callee?.bound && callee.root === 'test') {
        declarations.push({ location, name: titleFor(node, source), suite: suitesFor(node), inferredKind: kindFor(node, boundaries) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const seen = new Set<string>()
const seenLexicalIds = new Set<string>()
const matched = new Set<string>()
const records: TestRecord[] = []
let added = 0
for (const declaration of declarations) {
  const key = identity(declaration)
  if (seen.has(key)) throw new Error(`Ambiguous test identity ${key}; disambiguate duplicate declarations`)
  seen.add(key)
  const proposedId = lexicalId(declaration)
  if (seenLexicalIds.has(proposedId)) {
    throw new Error(`Ambiguous readable test ID ${proposedId}; disambiguate the suite or test title before writing`)
  }
  seenLexicalIds.add(proposedId)
  const old = prior.get(key)
  if (old) matched.add(old.id)
  else added++
  const record: TestRecord = {
    id: proposedId,
    name: declaration.name,
    ...(declaration.suite.length ? { suite: declaration.suite } : {}),
    description: old?.description ?? `Review what this declared test checks: ${declaration.name}`,
    kind: old?.kind && old.kind !== 'unclassified' ? old.kind : declaration.inferredKind,
    location: declaration.location,
  }
  if (!validate(record)) throw new Error(`Generated invalid test: ${JSON.stringify(validate.errors)}`)
  records.push(record)
}
const missing = previous.filter((entry) => !matched.has(entry.id))
if (missing.length) {
  throw new Error(`Unmatched prior test IDs: ${missing.map((entry) => entry.id).join(', ')}. Review renamed/moved/removed tests and all links; normal writes never prune automatically.`)
}

function hasSeparatedEntries(text: string, count: number): boolean {
  const lines = text.split(/\r?\n/)
  const starts = lines.flatMap((line, index) => line.startsWith('  - id:') ? [index] : [])
  return starts.length === count && starts.every((index, position) => position === 0 ||
    (lines[index - 1] === '' && lines[index - 2] !== ''))
}
function formatCatalog(entries: TestRecord[]): string {
  let first = true
  const body = YAML.stringify({ tests: entries }, { lineWidth: 110 }).replace(/^  - id:/gm, (line) => {
    if (first) { first = false; return line }
    return `\n${line}`
  })
  return '# Readable lexical test-declaration inventory. Curate descriptions and kinds before using as evidence pointers.\n' + body
}
function reportAmbiguities(): void {
  const unresolved = records.filter((entry) => entry.kind === 'unclassified')
  if (!unresolved.length) return
  console.warn(`${unresolved.length} test kind(s) need review:`)
  for (const entry of unresolved) {
    console.warn(`- ${entry.id}: ${entry.location} — ${[...(entry.suite ?? []), entry.name].join(' > ')}`)
  }
}
if (mode === '--check') {
  if (!existsSync(catalogFile) || !isDeepStrictEqual(previous, records) ||
      !hasSeparatedEntries(readFileSync(catalogFile, 'utf8'), records.length)) {
    console.error(`Test catalog is stale, has mismatched IDs, or lacks blank lines between entries (${added} new declarations). Review IDs and links before a refresh.`)
    process.exitCode = 1
  } else {
    console.log(`Test catalog matches ${records.length} declarations in ${files.length} app-owned test files.`)
  }
} else {
  if (force && existsSync(catalogFile)) {
    console.warn(`Replacing ${catalogFile} from source; previous IDs and curated metadata will be lost. Review authored links separately.`)
  }
  mkdirSync(dirname(catalogFile), { recursive: true })
  const temporary = `${catalogFile}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, formatCatalog(records), { flag: 'wx' })
    renameSync(temporary, catalogFile)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  console.log(`Wrote ${records.length} test declarations (${added} new) for ${appRoot}.`)
}
reportAmbiguities()
