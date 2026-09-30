import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const skill = fileURLToPath(new URL('../', import.meta.url))
const runner = join(skill, 'node_modules/.bin/tsx')
const script = join(skill, 'scripts/tests-catalog.ts')
const run = (app: string, mode: '--write' | '--check' | '--identity-preview' | '--write-lexical' | '--check-lexical') =>
  spawnSync(runner, [script, '--app', app, mode], { encoding: 'utf8' })

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

test('inventories declarations per app, preserves curated IDs, and rejects ambiguity/removals', () => {
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
    writeFileSync(source, fixture)
    writeFileSync(join(app, 'tests/node.ts'), "import { test as check } from 'node:test'\ncheck('node case', () => {})\n")
    writeFileSync(join(app, 'src/runtime.ts'), "export function test() {}\ntest()\n")
    writeFileSync(join(workspace, 'apps/web/other.test.ts'), "it('foreign', () => {})\n")

    assert.equal(run(app, '--check').status, 1)
    const preview = run(app, '--identity-preview')
    assert.equal(preview.status, 0, preview.stderr)
    const previewIds = JSON.parse(preview.stdout).tests.map((entry: { id: string }) => entry.id)
    assert.equal(previewIds[0], 'test:src/feature.test.ts#account.works')
    assert.equal(previewIds[1], 'test:src/feature.test.ts#account.value-s')
    assert.equal(previewIds[4], 'test:src/feature.test.ts#variant-s.works')
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
    const ids = entries.map((entry: { id: string }) => entry.id)
    assert.deepEqual(ids, previewIds)
    assert.equal(run(app, '--check-lexical').status, 0)
    assert.equal(run(app, '--write-lexical').status, 1, 'the initial-only writer must not replace linked entries')

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
    assert.equal(run(app, '--check-lexical').status, 0, 'curated fields remain valid in lexical mode')

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
    assert.equal(readFileSync(catalog, 'utf8'), beforeRemoval)

    writeFileSync(source, fixture + "const title = 'dynamic'\nit(title, () => {})\n")
    const dynamic = run(app, '--write')
    assert.notEqual(dynamic.status, 0)
    assert.match(dynamic.stderr, /Nonliteral or empty test\/suite name/)
    assert.equal(readFileSync(catalog, 'utf8'), beforeRemoval)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('initial-only lexical generation refuses normalized title collisions and preserves reviewed fields', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-tests-lexical-'))
  const source = join(app, 'src/cases.test.ts')
  const catalog = join(app, '.sourcespec/catalogs/tests-catalog.yaml')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"name":"lexical-tests","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(source, "import { test } from 'vitest'\ntest('space title', () => {})\n")
    const preview = run(app, '--identity-preview')
    assert.equal(preview.status, 0, preview.stderr)
    assert.equal(JSON.parse(preview.stdout).tests[0].id, 'test:src/cases.test.ts#space-title')
    assert.equal(run(app, '--write-lexical').status, 0)
    let text = readFileSync(catalog, 'utf8')
    assert.match(text, /id: test:src\/cases\.test\.ts#space-title/)
    const curated = YAML.parse(text)
    curated.tests[0].kind = 'integration'
    curated.tests[0].description = 'Reviewed test responsibility.'
    text = YAML.stringify(curated)
    writeFileSync(catalog, text)
    assert.equal(run(app, '--check-lexical').status, 0, 'curated description and kind survive checking')
    assert.equal(run(app, '--write-lexical').status, 1, 'existing curated catalog cannot be replaced')
    writeFileSync(source, "import { test } from 'vitest'\ntest('space title', () => {})\ntest('space-title', () => {})\n")
    const collision = run(app, '--identity-preview')
    assert.notEqual(collision.status, 0)
    assert.match(collision.stderr, /Ambiguous readable test ID/)
    assert.equal(run(app, '--write').status, 1)
    assert.equal(readFileSync(catalog, 'utf8'), text)

    writeFileSync(source, "import { test } from 'vitest'\ntest('space title', () => {})\n")
    writeFileSync(join(app, 'src/alpha case.test.ts'), "test('Ａ', () => {})\n")
    writeFileSync(join(app, 'src/alpha-case.test.ts'), "test('A', () => {})\n")
    const normalizedPath = run(app, '--identity-preview')
    assert.notEqual(normalizedPath.status, 0)
    assert.match(normalizedPath.stderr, /Ambiguous readable test ID test:src\/alpha-case\.test\.ts#A/)
    assert.equal(readFileSync(catalog, 'utf8'), text)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
