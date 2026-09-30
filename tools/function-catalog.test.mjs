import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const tool = fileURLToPath(new URL('function-catalog.mjs', import.meta.url))
const app = fileURLToPath(new URL('../example-apps/example-todo/', import.meta.url))
const YAML = createRequire(join(app, 'package.json'))('yaml')

test('readable lexical IDs expose ownership and fail closed when a range shifts', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'sspc-readable-catalog-'))
  const sourceFile = join(sandbox, 'src/index.ts')
  const catalog = join(sandbox, '.sourcespec/catalogs/functions-catalog.yaml')
  try {
    mkdirSync(join(sandbox, 'src'), { recursive: true })
    mkdirSync(join(sandbox, '.sourcespec/catalogs'), { recursive: true })
    symlinkSync(join(app, 'node_modules'), join(sandbox, 'node_modules'))
    writeFileSync(join(sandbox, 'package.json'), '{"private":true,"type":"module"}')
    writeFileSync(join(sandbox, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    const source = [
      'export class First { run() { return 1 } }',
      'export class Second { run() { return 2 } }',
      'export class Both { get state() { return 1 } set state(value: number) {} }',
      "export const routes = { 'sign in': () => 1, 'sign-in': () => 2 };",
      'export const callbacks = [() => 1, () => 2];',
      'void (() => 3);',
      '',
    ].join('\n')
    const run = (...args) => spawnSync(process.execPath, [tool, ...args], { cwd: sandbox, encoding: 'utf8' })
    writeFileSync(sourceFile, source)
    const created = run('--write')
    assert.equal(created.status, 0, created.stderr)
    assert.equal(run('--check').status, 0)
    const entries = YAML.parse(readFileSync(catalog, 'utf8')).functions
    assert(entries.some((entry) => entry.id === 'fn:src/index.ts#First.run'))
    assert(entries.some((entry) => entry.id === 'fn:src/index.ts#Second.run'))
    assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length)
    assert.equal(entries.filter((entry) => entry.id.includes('@utf16:')).length, 7,
      'get/set, two normalized property collisions, two callbacks, and one context-free callback')
    const first = entries.find((entry) => entry.id === 'fn:src/index.ts#First.run')
    first.description = 'Reviewed function responsibility.'
    writeFileSync(catalog, YAML.stringify({ functions: entries }))
    assert.equal(run('--write').status, 0)
    assert.equal(run('--check').status, 0)
    assert.equal(YAML.parse(readFileSync(catalog, 'utf8')).functions[0].description, 'Reviewed function responsibility.')
    const before = readFileSync(catalog, 'utf8')
    writeFileSync(sourceFile, 'const unrelated = () => false;\n' + source)
    const stale = run('--check')
    assert.notEqual(stale.status, 0)
    assert.match(stale.stderr, /Unmatched|Identity changed|catalog differs/i)
    const refresh = run('--write')
    assert.notEqual(refresh.status, 0, 'changed range identities require review rather than silent transfer')
    assert.equal(readFileSync(catalog, 'utf8'), before)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
