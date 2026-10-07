import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cliRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const installer = join(cliRoot, 'scripts/install-local.mjs')
const run = (command, args, home) => spawnSync(command, args, { cwd: tmpdir(), env: { ...process.env, HOME: home }, encoding: 'utf8' })

test('home-installed package works outside the checkout; unknown and symlinked homes are refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'sourcespec-install-test-'))
  try {
    const home = join(root, 'home')
    const app = join(root, 'app')
    mkdirSync(home)
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"private":true,"type":"module"}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(join(app, 'src/main.ts'), 'export function ready() { return true }\n')
    writeFileSync(join(app, 'src/main.test.ts'), "import { test } from 'node:test'\ntest('ready', () => {})\n")
    const installed = run(process.execPath, [installer], home)
    assert.equal(installed.status, 0, installed.stderr)
    const executable = join(home, '.sourcespec/bin/sourcespec')
    assert.match(readFileSync(join(home, '.sourcespec/schema/requirements.yaml'), 'utf8'), /title: Requirement/)
    assert.equal(run(executable, ['sspc-schemas', 'copy', '--app', app], home).status, 2,
      'schema copies are installed in the home, not in apps')
    for (const [area, catalogName, id] of [['sspc-functions', 'functions', 'fn:src/main.ts#ready'], ['sspc-tests', 'tests', 'test:src/main.test.ts#ready']]) {
      const written = run(executable, [area, 'write', '--app', app], home)
      assert.equal(written.status, 0, written.stderr)
      assert.ok(readFileSync(join(app, `.sourcespec/catalogs/${catalogName}-catalog.yaml`), 'utf8').includes(id))
      const checked = run(executable, [area, 'check', '--app', app], home)
      assert.equal(checked.status, 0, checked.stderr)
    }

    mkdirSync(join(app, '.sourcespec/requirements'), { recursive: true })
    writeFileSync(join(app, '.sourcespec/requirements/ready.yaml'), `id: ready
name: Ready
requirement: The app SHALL report readiness.
scenarios:
  - id: reports-ready
    name: Reports readiness
    given: [The app is running.]
    when: [Readiness is checked.]
    then: [Readiness is reported.]
    implementedBy:
      - function: fn:src/main.ts#ready
        role: Reports readiness.
    verifiedBy:
      - test: test:src/main.test.ts#ready
        checks: Readiness is reported.
`)
    const requirementCheck = run(executable, ['sspc-requirements', 'check', '--app', app], home)
    assert.equal(requirementCheck.status, 0, requirementCheck.stderr)

    const installedSchema = join(home, '.sourcespec/schema/requirements.yaml')
    const originalSchema = readFileSync(installedSchema, 'utf8')
    writeFileSync(installedSchema, originalSchema + '\n# operator change\n')
    const refusedSchema = run(process.execPath, [installer], home)
    assert.notEqual(refusedSchema.status, 0)
    assert.match(refusedSchema.stderr, /Installed schema differs/)
    writeFileSync(installedSchema, originalSchema)

    const unmanagedHome = join(root, 'unmanaged-home')
    mkdirSync(join(unmanagedHome, '.sourcespec'), { recursive: true })
    const refused = run(process.execPath, [installer], unmanagedHome)
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /not a recognized SourceSpec CLI installation/)

    const symlinkHome = join(root, 'symlink-home')
    const target = join(root, 'target')
    mkdirSync(symlinkHome)
    mkdirSync(target)
    writeFileSync(join(target, '.cli-install.json'), '{"package":"@sourcespec/cli"}')
    symlinkSync(target, join(symlinkHome, '.sourcespec'))
    const blocked = run(process.execPath, [installer], symlinkHome)
    assert.notEqual(blocked.status, 0)
    assert.match(blocked.stderr, /Refusing to install through a non-directory or symlink/)
    assert.equal(readFileSync(join(target, '.cli-install.json'), 'utf8'), '{"package":"@sourcespec/cli"}')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
