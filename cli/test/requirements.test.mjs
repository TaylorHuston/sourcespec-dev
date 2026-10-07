import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const tool = fileURLToPath(new URL('../dist/sourcespec.js', import.meta.url))
const { schemaEnv, schemaHome } = await import('./schema-fixture.ts')

test('Requirement checks use installed schemas and catalog links without JS/TS source or generated mappings', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-requirements-'))
  const run = (area, action) => spawnSync(process.execPath, [tool, area, action, '--app', app], { encoding: 'utf8', env: schemaEnv })
  try {
    mkdirSync(join(app, '.sourcespec/catalogs'), { recursive: true })
    mkdirSync(join(app, '.sourcespec/requirements'))
    writeFileSync(join(app, '.sourcespec/catalogs/functions-catalog.yaml'), `functions:
  - id: fn:worker.py#ready
    name: ready
    location: worker.py
    sourceScope: application
    parameters: []
    return:
      type: bool
`)
    writeFileSync(join(app, '.sourcespec/catalogs/tests-catalog.yaml'), `tests:
  - id: test:tests/test_worker.py#test_ready
    name: test_ready
    description: Checks the ready result.
    kind: unit
    location: tests/test_worker.py
`)
    const file = join(app, '.sourcespec/requirements/ready.yaml')
    const requirement = `id: ready
name: Ready
requirement: The worker SHALL report readiness.
scenarios:
  - id: reports-ready
    name: Reports readiness
    given: [The worker is running.]
    when: [Readiness is checked.]
    then: [Readiness is reported.]
    implementedBy:
      - function: fn:worker.py#ready
        role: Returns the readiness state.
    verifiedBy:
      - test: test:tests/test_worker.py#test_ready
        checks: Readiness is reported.
`
    writeFileSync(file, requirement)
    const valid = run('sspc-requirements', 'check')
    assert.equal(valid.status, 0, valid.stderr)
    assert.match(valid.stdout, /function and test catalog links resolve/)
    assert.equal(readFileSync(file, 'utf8'), requirement, 'check never rewrites authored prose or mappings')

    const schemaFile = join(schemaHome, '.sourcespec/schema/requirements.yaml')
    const schema = readFileSync(schemaFile, 'utf8')
    writeFileSync(schemaFile, schema.replace('required: [id, name, requirement, scenarios]',
      'required: [id, name, requirement, scenarios, appLocalOnly]'))
    const localSchema = run('sspc-requirements', 'check')
    assert.notEqual(localSchema.status, 0)
    assert.match(localSchema.stderr, /appLocalOnly/)
    writeFileSync(schemaFile, schema)

    writeFileSync(file, requirement.replace('fn:worker.py#ready', 'fn:worker.py#missing'))
    assert.match(run('sspc-requirements', 'check').stderr, /unknown function/)
    writeFileSync(file, requirement.replace('test:tests/test_worker.py#test_ready', 'test:tests/test_worker.py#missing'))
    assert.match(run('sspc-requirements', 'check').stderr, /unknown test/)
    writeFileSync(file, requirement.replace('id: reports-ready', 'id: reports-ready\n  - id: reports-ready'))
    assert.notEqual(run('sspc-requirements', 'check').status, 0, 'malformed Scenario structure fails closed')
    writeFileSync(file, requirement)
    assert.equal(run('sspc-requirements', 'check').status, 0)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
