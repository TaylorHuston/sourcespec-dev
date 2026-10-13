import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import { schemaEnv } from './schema-fixture.js'

const cliRoot = fileURLToPath(new URL('../', import.meta.url))
const script = join(cliRoot, 'dist/sourcespec.js')
const run = (app: string, mode: '--write' | '--check', force = false) => {
  return spawnSync(process.execPath, [script, 'sspc-tests', mode.slice(2), '--app', app, ...(force ? ['--force'] : [])], { encoding: 'utf8', env: schemaEnv })
}

const fixture = `import { beforeEach, describe, it, test } from 'vitest'
beforeEach(() => { const helper = () => 1; helper() })
describe('account', () => {
  it('works', () => { const mock = () => {}; mock() })
  test.each([1, 2])('value %s', (value) => { void value })
  it.skip('disabled', () => {})
  it.todo('planned')
})
describe.each([1, 2])('variant %s', () => {
  it('works', () => {})
})
`

test('inventories declarations per app, preserves curated lexical IDs, and rejects ambiguity/removals', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'sspc-tests-'))
  const app = join(workspace, 'apps/api')
  const catalog = join(app, '.sourcespec/catalogs/tests-catalog.yaml')
  const source = join(app, 'src/feature.test.ts')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    mkdirSync(join(app, 'tests'), { recursive: true })
    mkdirSync(join(workspace, 'apps/web'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"name":"fixture","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"},"include":["src"]}')
    writeFileSync(join(app, 'pnpm-workspace.yaml'), "packages: ['.']\n")
    writeFileSync(source, fixture)
    writeFileSync(join(app, 'tests/node.ts'), "import { test as check } from 'node:test'\ncheck('node case', () => {})\n")
    writeFileSync(join(app, 'src/runtime.ts'), "export function test() {}\ntest()\n")
    writeFileSync(join(workspace, 'apps/web/other.test.ts'), "it('foreign', () => {})\n")

    assert.equal(run(app, '--check').status, 1)
    const created = run(app, '--write')
    assert.equal(created.status, 0, created.stderr)
    const original = readFileSync(catalog, 'utf8')
    let entries = YAML.parse(original).tests
    assert.equal(entries.length, 6, 'five Vitest declarations and one node:test declaration')
    assert.equal((original.match(/\n\n  - id:/g) ?? []).length, 5)
    assert.deepEqual(entries.filter((entry: { location: string }) => entry.location === 'src/feature.test.ts')
      .map((entry: { name: string }) => entry.name), ['works', 'value %s', 'disabled', 'planned', 'works'])
    assert(entries.slice(0, 4).every((entry: { suite?: string[] }) => entry.suite?.join(' > ') === 'account'))
    assert.deepEqual(entries[4].suite, ['variant %s'])
    assert(entries.every((entry: { kind: string; description: string }) =>
      entry.kind === 'unclassified' && entry.description.startsWith('Review what')))
    assert(entries.every((entry: { name: string }) => entry.name !== 'foreign'))
    assert.equal(run(app, '--check').status, 0)
    writeFileSync(join(app, 'pnpm-workspace.yaml'), "packages: ['.', '../other']\n")
    assert.notEqual(run(app, '--check').status, 0, 'a multi-package root is not a standalone app')
    writeFileSync(join(app, 'pnpm-workspace.yaml'), "packages: ['.']\n")
    const ids = entries.map((entry: { id: string }) => entry.id)
    assert.equal(ids[0], 'test:src/feature.test.ts#account.works')
    assert.equal(ids[1], 'test:src/feature.test.ts#account.value-s')
    assert.equal(ids[4], 'test:src/feature.test.ts#variant-s.works')

    writeFileSync(catalog, original.replace('\n\n  - id:', '\n  - id:'))
    assert.equal(run(app, '--check').status, 1)
    assert.equal(run(app, '--write').status, 0)
    assert.deepEqual(YAML.parse(readFileSync(catalog, 'utf8')).tests.map((entry: { id: string }) => entry.id), ids)

    entries = YAML.parse(readFileSync(catalog, 'utf8')).tests
    entries[0].kind = 'component'
    entries[0].description = 'Checks that the account view responds to a request.'
    writeFileSync(catalog, YAML.stringify({ tests: entries }))
    assert.equal(run(app, '--write').status, 0)
    entries = YAML.parse(readFileSync(catalog, 'utf8')).tests
    assert.equal(entries[0].description, 'Checks that the account view responds to a request.')
    assert.equal(entries[0].kind, 'component')
    assert.deepEqual(entries.map((entry: { id: string }) => entry.id), ids)
    assert.equal(run(app, '--check').status, 0, 'curated fields remain valid')
    const curatedText = readFileSync(catalog, 'utf8')
    entries[0].id = 'test:legacy-identity'
    writeFileSync(catalog, YAML.stringify({ tests: entries }))
    const nonlexical = run(app, '--write')
    assert.notEqual(nonlexical.status, 0)
    assert.match(nonlexical.stderr, /Test identity changed/)
    writeFileSync(catalog, curatedText)

    const beforeRemoval = readFileSync(catalog, 'utf8')
    writeFileSync(source, fixture.replace("  it.skip('disabled', () => {})\n", ''))
    const removed = run(app, '--write')
    assert.notEqual(removed.status, 0)
    assert.match(removed.stderr, /Unmatched prior test IDs/)
    assert.equal(readFileSync(catalog, 'utf8'), beforeRemoval)

    writeFileSync(source, fixture.replace("  it.todo('planned')", "  it('works', () => {})\n  it.todo('planned')"))
    const duplicate = run(app, '--write')
    assert.notEqual(duplicate.status, 0)
    assert.match(duplicate.stderr, /Ambiguous test identity/)
    assert.notEqual(run(app, '--write', true).status, 0, 'force still refuses ambiguous source declarations')
    assert.equal(readFileSync(catalog, 'utf8'), beforeRemoval)

    writeFileSync(source, fixture + "const title = 'dynamic'\nit(title, () => {})\n")
    const dynamic = run(app, '--write')
    assert.notEqual(dynamic.status, 0)
    assert.match(dynamic.stderr, /Nonliteral or empty test\/suite name/)
    assert.notEqual(run(app, '--write', true).status, 0, 'force still refuses dynamic test names')
    assert.equal(readFileSync(catalog, 'utf8'), beforeRemoval)
    assert.equal(run(app, '--check', true).status, 2, '--force is only allowed for write')
    assert.equal(readFileSync(catalog, 'utf8'), beforeRemoval)
    writeFileSync(source, fixture.replace("  it.skip('disabled', () => {})\n", ''))
    const legacy = YAML.parse(beforeRemoval)
    legacy.tests[0].id = 'test-legacy-id'
    writeFileSync(catalog, YAML.stringify(legacy))
    assert.notEqual(run(app, '--write').status, 0, 'normal write refuses legacy IDs')
    const forced = run(app, '--write', true)
    assert.equal(forced.status, 0, forced.stderr)
    assert.match(forced.stderr, /previous IDs and curated metadata will be lost/)
    const replaced = YAML.parse(readFileSync(catalog, 'utf8')).tests
    assert.equal(replaced.length, 5)
    assert(!replaced.some((entry: { id: string; description: string; kind: string }) =>
      entry.id === 'test-legacy-id' || entry.description === 'Checks that the account view responds to a request.' || entry.kind === 'component'))
    assert.equal(run(app, '--check').status, 0)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('normal generation refuses normalized title and path collisions', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-tests-lexical-'))
  const source = join(app, 'src/cases.test.ts')
  const catalog = join(app, '.sourcespec/catalogs/tests-catalog.yaml')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"name":"lexical-tests","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(source, "import { test } from 'vitest'\ntest('space title', () => {})\n")
    assert.equal(run(app, '--write').status, 0)
    let text = readFileSync(catalog, 'utf8')
    assert.match(text, /id: test:src\/cases\.test\.ts#space-title/)
    const curated = YAML.parse(text)
    curated.tests[0].kind = 'integration'
    curated.tests[0].description = 'Reviewed test responsibility.'
    text = YAML.stringify(curated)
    writeFileSync(catalog, text)
    assert.equal(run(app, '--check').status, 0, 'curated description and kind survive checking')
    writeFileSync(source, "import { test } from 'vitest'\ntest('space title', () => {})\ntest('space-title', () => {})\n")
    const collision = run(app, '--write')
    assert.notEqual(collision.status, 0)
    assert.match(collision.stderr, /Ambiguous readable test ID/)
    assert.equal(run(app, '--write').status, 1)
    assert.equal(readFileSync(catalog, 'utf8'), text)

    writeFileSync(source, "import { test } from 'vitest'\ntest('space title', () => {})\n")
    writeFileSync(join(app, 'src/alpha case.test.ts'), "test('Ａ', () => {})\n")
    writeFileSync(join(app, 'src/alpha-case.test.ts'), "test('A', () => {})\n")
    const normalizedPath = run(app, '--write')
    assert.notEqual(normalizedPath.status, 0)
    assert.match(normalizedPath.stderr, /Ambiguous readable test ID test:src\/alpha-case\.test\.ts#A/)
    assert.equal(readFileSync(catalog, 'utf8'), text)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
