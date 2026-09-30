import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('../example-apps/example-todo/', import.meta.url))
const tool = fileURLToPath(new URL('requirements-check.mjs', import.meta.url))
const YAML = createRequire(join(app, 'package.json'))('yaml')

test('checks lexical test IDs, enclosing suites, and uncataloged declarations', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'sspc-tests-check-'))
  try {
    cpSync(join(app, '.sourcespec'), join(sandbox, '.sourcespec'), { recursive: true })
    for (const file of ['package.json', 'tsconfig.json']) copyFileSync(join(app, file), join(sandbox, file))
    for (const directory of ['server', 'src']) {
      mkdirSync(join(sandbox, directory))
      for (const file of readdirSync(join(app, directory)).filter((name) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name))) {
        copyFileSync(join(app, directory, file), join(sandbox, directory, file))
      }
    }
    symlinkSync(join(app, 'node_modules'), join(sandbox, 'node_modules'))
    const source = join(sandbox, 'server/nested.test.ts')
    const title = "import { describe, test as check } from 'vitest'\ndescribe('Account', () => { check.each([1, 2])('loads %s', () => {}) })\ndescribe('Public', () => { check('loads %s', () => {}) })\n"
    writeFileSync(source, title)
    const catalog = join(sandbox, '.sourcespec/catalogs/tests-catalog.yaml')
    const original = YAML.parse(readFileSync(catalog, 'utf8'))
    const fixture = { ...original, tests: [
      ...original.tests,
      { id: 'test:server/nested.test.ts#Account.loads-s', name: 'loads %s', suite: ['Account'],
        description: 'Account case.', kind: 'unit', location: 'server/nested.test.ts' },
      { id: 'test:server/nested.test.ts#Public.loads-s', name: 'loads %s', suite: ['Public'],
        description: 'Public case.', kind: 'unit', location: 'server/nested.test.ts' },
    ] }
    const run = () => spawnSync(process.execPath, [tool], { cwd: sandbox, encoding: 'utf8' })
    writeFileSync(catalog, YAML.stringify(fixture))
    const valid = run()
    assert.equal(valid.status, 0, valid.stderr)
    assert.match(valid.stdout, /all 19 test declarations resolve/)
    for (const ignored of ['.next', 'playwright-report']) {
      mkdirSync(join(sandbox, ignored))
      writeFileSync(join(sandbox, ignored, 'generated.test.ts'), "test('generated artifact', () => {})\n")
    }
    assert.equal(run().status, 0, 'generated/local test directories are outside the catalog scope')

    fixture.tests.at(-1).id = 'test:server/nested.test.ts#wrong'
    writeFileSync(catalog, YAML.stringify(fixture))
    const wrongId = run()
    assert.notEqual(wrongId.status, 0)
    assert.match(wrongId.stderr, /Nonlexical test ID/)
    fixture.tests.at(-1).id = 'test:server/nested.test.ts#Public.loads-s'
    writeFileSync(catalog, YAML.stringify(fixture))

    writeFileSync(source, title.replace("describe('Account'", "describe('Accounts'"))
    const staleSuite = run()
    assert.notEqual(staleSuite.status, 0)
    assert.match(staleSuite.stderr, /not declared|Uncataloged test declaration/)

    writeFileSync(source, title + "check('new unlinked test', () => {})\n")
    const unlinked = run()
    assert.notEqual(unlinked.status, 0)
    assert.match(unlinked.stderr, /Uncataloged test declaration/)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
