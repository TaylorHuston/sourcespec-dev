import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const skillRoot = fileURLToPath(new URL('../', import.meta.url))
const runner = join(skillRoot, 'node_modules/.bin/tsx')
const script = join(skillRoot, 'scripts/functions-catalog.ts')

function run(app: string, mode: '--probe' | '--write' | '--check') {
  return spawnSync(runner, [script, '--app', app, mode], { encoding: 'utf8' })
}

function runScope(project: string, scope: string, mode: '--probe' | '--write' | '--check') {
  return spawnSync(runner, [script, '--project', project, '--scope', scope, mode], { encoding: 'utf8' })
}

test('inventories only one app, preserves IDs and annotations, and refuses silent removals', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'sspc-functions-'))
  const app = join(workspace, 'apps/api')
  const catalog = join(app, '.sourcespec/catalogs/functions-catalog.yaml')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    mkdirSync(join(workspace, 'apps/web'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"name":"test-api","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"},"include":["src/index.ts"]}')
    writeFileSync(join(app, 'src/index.ts'), 'export function value(input: number) { return input + 1 }\n[1].map((item) => item + 1)\nexport function withCleanup() { return () => 1 }\n')
    writeFileSync(join(app, 'src/index.test.ts'), "it('works', () => { value(1) })\n")
    writeFileSync(join(app, 'vite.config.ts'), 'export default { configure: () => true }\n')
    writeFileSync(join(app, 'scripts.mts'), 'export function run() { return true }\n')
    writeFileSync(join(workspace, 'apps/web/other.ts'), 'export function foreign() { return 1 }\n')

    assert.equal(run(app, '--check').status, 1, 'a missing catalog needs a refresh')
    const created = run(app, '--write')
    assert.equal(created.status, 0, created.stderr)
    let text = readFileSync(catalog, 'utf8')
    const initialIds = YAML.parse(text).functions.map((entry: { id: string }) => entry.id)
    assert.equal((text.match(/\n\n  - id:/g) ?? []).length, 6, 'blank line between each pair of entries')
    writeFileSync(catalog, text.replace('\n\n  - id:', '\n  - id:'))
    const unspaced = run(app, '--check')
    assert.equal(unspaced.status, 1)
    assert.match(unspaced.stderr, /blank line/)
    assert.equal(run(app, '--write').status, 0, 'refresh restores spacing without changing IDs')
    assert.equal(run(app, '--check').status, 0)
    text = readFileSync(catalog, 'utf8')
    assert.equal((text.match(/\n\n  - id:/g) ?? []).length, 6)
    let entries = YAML.parse(text).functions
    assert.deepEqual(entries.map((entry: { id: string }) => entry.id), initialIds)
    assert.equal(entries.length, 7)
    assert(entries.some((entry: { id: string }) => entry.id === 'fn:src/index.ts#value'))
    const scopeOf = (location: string) => entries.find((entry: { location: string }) => entry.location === location)?.sourceScope
    assert.equal(scopeOf('src/index.ts'), 'application')
    assert.equal(scopeOf('src/index.test.ts'), 'test')
    assert.equal(scopeOf('vite.config.ts'), 'tooling')
    assert.equal(scopeOf('scripts.mts'), 'unclassified')
    const ambiguous = run(app, '--check')
    assert.match(ambiguous.stderr, /function source scope\(s\) need review/)
    assert.match(ambiguous.stderr, /scripts\.mts/)
    const legacy = YAML.parse(readFileSync(catalog, 'utf8'))
    delete legacy.functions[0].sourceScope
    writeFileSync(catalog, YAML.stringify(legacy))
    assert.equal(run(app, '--check').status, 1)
    assert.equal(run(app, '--write').status, 0, 'migrates an old catalog without reassigning IDs')
    assert.deepEqual(YAML.parse(readFileSync(catalog, 'utf8')).functions.map((entry: { id: string }) => entry.id), initialIds)
    assert(entries.some((entry: { context?: string }) => entry.context?.includes('withCleanup > return')))
    assert(entries.some((entry: { context?: string }) => entry.context?.includes('it(works)')))
    assert(entries.some((entry: { location: string }) => entry.location === 'vite.config.ts'))
    assert(entries.every((entry: { location: string }) => !entry.location.includes('web/')))
    assert.equal(run(app, '--check').status, 0)

    const ids = entries.map((entry: { id: string }) => entry.id)
    entries[0].description = 'Curated investigation hint.'
    entries[0].sourceScope = 'unclassified' // Explicit review overrides the adapter's path convention.
    writeFileSync(catalog, YAML.stringify({ functions: entries }))
    assert.equal(run(app, '--write').status, 0)
    entries = YAML.parse(readFileSync(catalog, 'utf8')).functions
    assert.deepEqual(entries.map((entry: { id: string }) => entry.id), ids)
    assert.equal(entries[0].description, 'Curated investigation hint.')
    assert.equal(entries[0].sourceScope, 'unclassified')
    const validCatalog = readFileSync(catalog, 'utf8')
    entries[0].sourceScope = 'not-a-scope'
    writeFileSync(catalog, YAML.stringify({ functions: entries }))
    const invalidScope = run(app, '--check')
    assert.notEqual(invalidScope.status, 0)
    assert.match(invalidScope.stderr, /Invalid catalog function/)
    writeFileSync(catalog, validCatalog)

    writeFileSync(join(app, 'src/index.ts'), 'export function value(input: number) { return input + 1 }\n[1].map((item) => item + 1)\nexport function withCleanup() { return () => 1 }\nexport function added() { return 2 }\n')
    assert.equal(run(app, '--check').status, 1)
    assert.equal(run(app, '--write').status, 0)
    const beforeRemoval = readFileSync(catalog, 'utf8')
    writeFileSync(join(app, 'src/index.ts'), 'export function added() { return 2 }\n')
    const refused = run(app, '--write')
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /Unmatched prior IDs/)
    assert.equal(readFileSync(catalog, 'utf8'), beforeRemoval)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('binds decorated fields, class callbacks, and default exports across harmless reordering', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-semantic-'))
  const catalog = join(app, '.sourcespec/catalogs/functions-catalog.yaml')
  const file = join(app, 'index.ts')
  try {
    writeFileSync(join(app, 'package.json'), '{"name":"semantic-identities","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"experimentalDecorators":true}}')
    const fields = [
      "  @ForeignKey(() => 'user') userId = ''",
      "  @ForeignKey(() => 'organization') organizationId = ''",
      '  first = () => 1',
      '  second = () => 2',
    ]
    const source = (lines: string[]) => `function ForeignKey(callback: () => string) { return () => {} }\nclass Records {\n  parse(value: string): number\n  parse(value: number): number\n  parse(value: string | number): number { return 1 }\n${lines.join('\n')}\n}\nexport default () => 3\n`
    writeFileSync(file, source(fields))
    const probe = run(app, '--probe')
    assert.equal(probe.status, 0, probe.stderr)
    assert.match(probe.stdout, /Excluded 2 signature-only declaration/)
    assert.equal(run(app, '--write').status, 0)
    const entries = YAML.parse(readFileSync(catalog, 'utf8')).functions as { id: string; name?: string; context?: string }[]
    assert.equal(entries.filter((entry) => entry.name === 'parse').length, 1)
    assert(entries.some((entry) => entry.context?.includes('Records > userId field > ForeignKey')))
    assert(entries.some((entry) => entry.context?.includes('Records > organizationId field > ForeignKey')))
    assert(entries.some((entry) => entry.context === 'default export'))
    writeFileSync(file, source([fields[3], '// no semantic change', fields[1], fields[2], fields[0]]))
    assert.equal(run(app, '--write').status, 0, 'moving fields must retain their IDs')
    const refreshed = YAML.parse(readFileSync(catalog, 'utf8')).functions as { id: string; context?: string }[]
    assert.deepEqual(Object.fromEntries(refreshed.map((entry) => [entry.context, entry.id])),
      Object.fromEntries(entries.map((entry) => [entry.context, entry.id])))
    assert.equal(run(app, '--check').status, 0)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('probes a monorepo-owned scope before writing, including assignment callbacks and source ownership', () => {
  const project = mkdtempSync(join(tmpdir(), 'sspc-scoped-'))
  const catalog = join(project, 'server/.sourcespec/catalogs/functions-catalog.yaml')
  try {
    mkdirSync(join(project, 'server/__mocks__'), { recursive: true })
    mkdirSync(join(project, 'server/migrations'), { recursive: true })
    mkdirSync(join(project, 'server/build'), { recursive: true })
    mkdirSync(join(project, 'app'), { recursive: true })
    mkdirSync(join(project, 'shared'), { recursive: true })
    writeFileSync(join(project, 'package.json'), '{"name":"monorepo","private":true}')
    writeFileSync(join(project, 'pnpm-workspace.yaml'), 'packages: [server, app]\n')
    writeFileSync(join(project, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"},"exclude":["server/migrations"]}')
    writeFileSync(join(project, 'server/handler.ts'), 'export function handle(value: string): number\nexport function handle(value: number): number\nexport function handle(value: string | number): number { return 1 }\n')
    writeFileSync(join(project, 'server/__mocks__/console.js'), 'global.console.warn = () => {}\n')
    writeFileSync(join(project, 'server/migrations/001.ts'), 'export function up() { return 2 }\n')
    writeFileSync(join(project, 'server/build/generated.ts'), 'export function generated() { return 99 }\n')
    writeFileSync(join(project, 'app/view.ts'), 'export function render() { return 3 }\n')
    writeFileSync(join(project, 'shared/utility.ts'), 'export function shared() { return 4 }\n')

    const probe = runScope(project, 'server', '--probe')
    assert.equal(probe.status, 0, probe.stderr)
    assert.match(probe.stdout, /3 definitions in 3 source files; 3 provisionally recordable; 0 identity issue/)
    assert.match(probe.stdout, /Excluded 2 signature-only declaration/)
    assert.match(probe.stdout, /__mocks__=1/)
    assert.match(probe.stdout, /migrations=1/)
    assert.match(probe.stdout, /Skipped generated\/local directories \(1\): build/)
    assert.equal(run(project, '--probe').status, 1, 'legacy --app refuses a workspace root')
    assert.equal(runScope(project, '../outside', '--probe').status, 1, 'scope cannot escape the project')
    assert.equal(runScope(project, 'server', '--check').status, 1, 'missing scoped catalog needs a refresh')
    assert.equal(runScope(project, 'server', '--write').status, 0)
    const entries = YAML.parse(readFileSync(catalog, 'utf8')).functions
    assert.equal(entries.length, 3)
    assert.equal(entries.find((entry: { location: string }) => entry.location === '__mocks__/console.js')?.context, 'global.console.warn assignment')
    assert.equal(entries.find((entry: { location: string }) => entry.location === '__mocks__/console.js')?.sourceScope, 'test')
    assert.equal(entries.find((entry: { location: string }) => entry.location === 'migrations/001.ts')?.sourceScope, 'tooling')
    assert.equal(entries.find((entry: { location: string }) => entry.location === 'handler.ts')?.sourceScope, 'application')
    assert.equal(runScope(project, 'server', '--check').status, 0)
    assert(entries.every((entry: { location: string }) => !entry.location.includes('app/') && !entry.location.includes('shared/')))

    writeFileSync(join(project, 'server/recursive.ts'), 'export type Branch = Branch[] | { value: number }\nexport function recursivelyTyped(): Branch { return [] }\n')
    const recursive = runScope(project, 'server', '--probe')
    assert.equal(recursive.status, 0, recursive.stderr)
    assert.match(recursive.stdout, /4 definitions in 4 source files; 4 provisionally recordable/)
    assert.equal(runScope(project, 'server', '--write').status, 0, 'recursive types summarize without overflowing')
    assert.equal(runScope(project, 'server', '--check').status, 0)

    writeFileSync(join(project, 'server/broken.ts'), 'export const callbacks = [() => 1, () => 2];\nvoid (() => 3);\n')
    const resolved = runScope(project, 'server', '--probe')
    assert.equal(resolved.status, 0, resolved.stderr)
    assert.match(resolved.stdout, /Identity issues by cause: none/)
    assert.equal(runScope(project, 'server', '--write').status, 0)
    const withRanges = YAML.parse(readFileSync(catalog, 'utf8')).functions as { id: string; location: string }[]
    assert.equal(withRanges.filter((entry) => entry.location === 'broken.ts').length, 3)
    assert(withRanges.filter((entry) => entry.location === 'broken.ts').every((entry) => entry.id.includes('@utf16:')))
    const finalCheck = runScope(project, 'server', '--check')
    assert.equal(finalCheck.status, 0, finalCheck.stderr)
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
