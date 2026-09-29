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

function run(app: string, mode: '--write' | '--check') {
  return spawnSync(runner, [script, '--app', app, mode], { encoding: 'utf8' })
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
