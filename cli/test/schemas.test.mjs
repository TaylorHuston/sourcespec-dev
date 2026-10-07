import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const tool = fileURLToPath(new URL('../dist/sourcespec.js', import.meta.url))
const { schemaEnv, schemaHome } = await import('./schema-fixture.ts')

test('catalog checks use shared home schemas, fail when absent, and never copy schemas into apps', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-schemas-app-'))
  const emptyHome = mkdtempSync(join(tmpdir(), 'sspc-schemas-empty-home-'))
  const run = (env, action) => spawnSync(process.execPath,
    [tool, 'sspc-functions', action, '--app', app], { encoding: 'utf8', env })
  try {
    mkdirSync(join(app, 'src'))
    writeFileSync(join(app, 'package.json'), '{"private":true,"type":"module"}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(join(app, 'src/index.ts'), 'export function ready() { return true }\n')
    const missing = run({ ...process.env, HOME: emptyHome }, 'check')
    assert.notEqual(missing.status, 0)
    assert.match(missing.stderr, /Reinstall the SourceSpec CLI/)
    assert.equal(existsSync(join(app, '.sourcespec')), false, 'checks never copy schemas into apps')

    assert.equal(run(schemaEnv, 'write').status, 0)
    assert.equal(run(schemaEnv, 'check').status, 0)
    assert.equal(existsSync(join(app, '.sourcespec/schema')), false)

    const shared = join(schemaHome, '.sourcespec/schema/functions.yaml')
    const original = readFileSync(shared, 'utf8')
    writeFileSync(shared, original.replace('  - id\n  - name', '  - id\n  - appLocalOnly\n  - name'))
    assert.notEqual(run(schemaEnv, 'check').status, 0, 'checks must validate against the installed home schema')
    writeFileSync(shared, original)
    assert.equal(run(schemaEnv, 'check').status, 0)
  } finally {
    rmSync(app, { recursive: true, force: true })
    rmSync(emptyHome, { recursive: true, force: true })
  }
})
