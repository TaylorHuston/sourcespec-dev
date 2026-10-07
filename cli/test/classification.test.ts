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
const run = (app: string, mode: '--write' | '--check') => {
  return spawnSync(process.execPath, [join(cliRoot, 'dist/sourcespec.js'), 'sspc-tests', mode.slice(2), '--app', app], { encoding: 'utf8', env: schemaEnv })
}

test('classifies only invoked boundaries and reports genuinely unresolved tests', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-test-kinds-'))
  const file = join(app, 'src/boundaries.test.tsx')
  const catalog = join(app, '.sourcespec/catalogs/tests-catalog.yaml')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(file, `import request from 'supertest'
import { render as show } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { it } from 'vitest'
it('web', () => { show('view') })
it('ssr', () => { renderToStaticMarkup('view') })
it('http', () => { request('app') })
it('mixed', () => { show('view'); request('app') })
it('only imports', () => { const result = 1; return result })
`)
    const created = run(app, '--write')
    assert.equal(created.status, 0, created.stderr)
    const entries = YAML.parse(readFileSync(catalog, 'utf8')).tests
    assert.deepEqual(entries.map((entry: { kind: string }) => entry.kind),
      ['component', 'component', 'api', 'unclassified', 'unclassified'])
    assert.match(created.stderr, /2 test kind\(s\) need review/)
    assert.match(created.stderr, /mixed/)
    assert.match(created.stderr, /only imports/)
    assert.equal(run(app, '--check').status, 0)
    const ids = entries.map((entry: { id: string }) => entry.id)
    entries[3].kind = 'integration' // A reviewed classification overrides heuristic evidence.
    writeFileSync(catalog, YAML.stringify({ tests: entries }))
    assert.equal(run(app, '--write').status, 0)
    const refreshed = YAML.parse(readFileSync(catalog, 'utf8')).tests
    assert.deepEqual(refreshed.map((entry: { id: string }) => entry.id), ids)
    assert.equal(refreshed[3].kind, 'integration')
    assert.equal(refreshed[4].kind, 'unclassified')
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
