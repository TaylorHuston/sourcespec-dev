import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('../', import.meta.url))
const tool = join(cliRoot, 'dist/sourcespec.js')
const YAML = createRequire(join(cliRoot, 'package.json'))('yaml')

test('readable lexical IDs expose ownership and fail closed when a range shifts', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'sspc-readable-catalog-'))
  const sourceFile = join(sandbox, 'src/index.ts')
  const catalog = join(sandbox, '.sourcespec/catalogs/functions-catalog.yaml')
  try {
    mkdirSync(join(sandbox, 'src'), { recursive: true })
    mkdirSync(join(sandbox, '.sourcespec/catalogs'), { recursive: true })
    symlinkSync(join(cliRoot, 'node_modules'), join(sandbox, 'node_modules'))
    writeFileSync(join(sandbox, 'package.json'), '{"private":true,"type":"module"}')
    writeFileSync(join(sandbox, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022","strict":true}}')
    const source = [
      'export class First { run() { return 1 } }',
      'export class Second { run() { return 2 } }',
      'export class Both { get state() { return 1 } set state(value: number) {} }',
      "export const routes = { 'sign in': () => 1, 'sign-in': () => 2 };",
      'export const callbacks = [() => 1, () => 2];',
      'void (() => 3);',
      'export function openStore() { return { register: (name: string) => ({ name }), authenticate: (password: string) => ({ token: password }), sessionUser: (token: string) => ({ token }) } }',
      'export type Store = ReturnType<typeof openStore>',
      'export function withStore(store: Store) { return store.register("a") }',
      'export function withOptional(options?: { value: string }) { return options?.value }',
      'export const pair = (value: [string, { active: boolean }]) => value[1].active',
      '',
    ].join('\n')
    const run = (mode, force = false) => spawnSync(process.execPath,
      [tool, 'sspc-functions', mode.slice(2), '--app', sandbox, ...(force ? ['--force'] : [])], { encoding: 'utf8' })
    writeFileSync(sourceFile, source)
    const created = run('--write')
    assert.equal(created.status, 0, created.stderr)
    assert.equal(run('--check').status, 0)
    const entries = YAML.parse(readFileSync(catalog, 'utf8')).functions
    assert(entries.some((entry) => entry.id === 'fn:src/index.ts#First.run'))
    assert(entries.some((entry) => entry.id === 'fn:src/index.ts#Second.run'))
    assert.equal(entries.find((entry) => entry.id === 'fn:src/index.ts#withStore')?.parameters[0]?.type, 'Store')
    assert.match(entries.find((entry) => entry.id === 'fn:src/index.ts#withOptional')?.parameters[0]?.type, /undefined/)
    assert.match(entries.find((entry) => entry.id === 'fn:src/index.ts#pair-variable')?.parameters[0]?.type, /^\[string,/)
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
    first.source = { file: 'src/index.ts', start: 0 }
    writeFileSync(catalog, YAML.stringify({ functions: entries }))
    const noncurrent = run('--write')
    assert.notEqual(noncurrent.status, 0)
    assert.match(noncurrent.stderr, /Invalid catalog function/)
    writeFileSync(catalog, before)
    writeFileSync(sourceFile, 'const unrelated = () => false;\n' + source)
    const stale = run('--check')
    assert.notEqual(stale.status, 0)
    assert.match(stale.stderr, /Unmatched|Identity changed|catalog differs/i)
    const refresh = run('--write')
    assert.notEqual(refresh.status, 0, 'changed range identities require review rather than silent transfer')
    assert.equal(readFileSync(catalog, 'utf8'), before)
    const rejectedCheck = run('--check', true)
    assert.equal(rejectedCheck.status, 2, '--force is only allowed for write')
    assert.equal(readFileSync(catalog, 'utf8'), before)
    const old = YAML.parse(before)
    old.functions[0].id = 'fn-legacy-id'
    writeFileSync(catalog, YAML.stringify(old))
    assert.notEqual(run('--write').status, 0, 'normal write refuses legacy IDs')
    const forced = run('--write', true)
    assert.equal(forced.status, 0, forced.stderr)
    assert.match(forced.stderr, /previous IDs and curated metadata will be lost/)
    const replaced = YAML.parse(readFileSync(catalog, 'utf8')).functions
    assert.equal(replaced.length, entries.length + 1)
    assert(!replaced.some((entry) => entry.id === 'fn-legacy-id' || entry.description === 'Reviewed function responsibility.'))
    assert.equal(run('--check').status, 0)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
