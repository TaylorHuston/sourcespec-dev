import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

type Entry = { id: string; name: string | null; context: string; kind: string; offsetFallback: boolean;
  range: { startUtf16: number; endUtf16: number } }
type Preview = { definitions: number; offsetFallbacks: number; issues: string[]; functions: Entry[] }
const root = fileURLToPath(new URL('../', import.meta.url))
const script = join(root, 'scripts/functions-catalog.ts')
const runner = join(root, 'node_modules/.bin/tsx')
const run = (app: string, mode: '--identity-preview' | '--probe' | '--check' | '--write') =>
  spawnSync(runner, [script, '--app', app, mode], { encoding: 'utf8' })

test('semantic breadcrumb IDs survive insertion while ambiguous callbacks get local ranges', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-identity-preview-'))
  const file = join(app, 'src/index.ts')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"name":"identity-preview","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    const source = [
      'export class First { run() { return 1 } }',
      'export class Second { run() { return 2 } }',
      'export class Both { get state() { return 1 } set state(value: number) {} }',
      'export const handler = () => true;',
      'export const callbacks = [() => 1, () => 2];',
      'void (() => 3);',
      '',
    ].join('\n')
    writeFileSync(file, source)
    const initial = run(app, '--identity-preview')
    assert.equal(initial.status, 0, initial.stderr)
    const before = JSON.parse(initial.stdout) as Preview
    assert.equal(before.definitions, 8)
    assert.equal(before.functions.length, 8)
    assert.equal(before.offsetFallbacks, 5, 'two repeated callbacks, named getter/setter, and one context-free callback')
    assert.deepEqual(before.issues, [])
    assert.equal(new Set(before.functions.map((entry) => entry.id)).size, 8)
    assert(before.functions.some((entry) => entry.id === 'fn:src/index.ts#First.run'))
    assert(before.functions.some((entry) => entry.id === 'fn:src/index.ts#Second.run'))
    assert.equal(before.functions.filter((entry) => entry.name === 'run' && !entry.offsetFallback).length, 2)
    assert.equal(before.functions.filter((entry) => entry.name === 'state' && entry.offsetFallback).length, 2)
    assert.equal(before.functions.filter((entry) => entry.context.includes('callbacks variable') && entry.offsetFallback).length, 2)
    assert(before.functions.filter((entry) => entry.offsetFallback).every((entry) => entry.context.includes('@utf16:')))
    assert.equal(run(app, '--probe').status, 0, 'the catalog handles collisions with explicit ranges')
    const catalog = join(app, '.sourcespec/catalogs/functions-catalog.yaml')
    assert(!existsSync(catalog))

    const unicodeSource = 'const emoji = "😀";\n' + source
    writeFileSync(file, unicodeSource)
    const unicode = JSON.parse(run(app, '--identity-preview').stdout) as Preview
    const callbackStart = unicodeSource.indexOf('() => 1', unicodeSource.indexOf('export const callbacks'))
    const callback = unicode.functions.find((entry) => entry.context.includes('callbacks variable') &&
      entry.range.startUtf16 === callbackStart)
    assert(callback)
    assert.equal(callback.range.endUtf16, callbackStart + '() => 1'.length)
    assert(Buffer.byteLength(unicodeSource.slice(0, callbackStart)) > callbackStart, 'byte offsets would differ after an astral character')

    writeFileSync(file, 'const unrelated = () => false;\n' + source)
    const changed = run(app, '--identity-preview')
    assert.equal(changed.status, 0, changed.stderr)
    const after = JSON.parse(changed.stdout) as Preview
    assert.equal(after.definitions, 9)
    assert.equal(after.offsetFallbacks, 5)
    for (const original of before.functions.filter((entry) => !entry.offsetFallback)) {
      assert(after.functions.some((entry) => entry.id === original.id), `${original.context} should survive insertion`)
    }
    for (const original of before.functions.filter((entry) => entry.offsetFallback)) {
      assert(!after.functions.some((entry) => entry.id === original.id), 'range-derived IDs should change when positions shift')
    }

    writeFileSync(file, 'const unrelated = () => false;\n' + source + 'export const lone = [() => 1];\n')
    const unique = JSON.parse(run(app, '--identity-preview').stdout) as Preview
    const oldLone = unique.functions.find((entry) => entry.context === 'lone variable')
    assert(oldLone && !oldLone.offsetFallback)
    writeFileSync(file, 'const unrelated = () => false;\n' + source + 'export const lone = [() => 1, () => 2];\n')
    const doubled = JSON.parse(run(app, '--identity-preview').stdout) as Preview
    assert.equal(doubled.functions.filter((entry) => entry.context.startsWith('lone variable') && entry.offsetFallback).length, 2)
    assert(!doubled.functions.some((entry) => entry.id === oldLone.id), 'unique becoming ambiguous must not silently retain its old identity')
    assert(doubled.functions.filter((entry) => entry.context.startsWith('lone variable')).every((entry) =>
      entry.id.startsWith('fn:src/index.ts#lone-variable@utf16:')))

    writeFileSync(file, 'export function safe(value: number) { return value + 1 }\n')
    assert.equal(run(app, '--write').status, 0)
    const catalogBefore = readFileSync(catalog, 'utf8')
    const previewOne = run(app, '--identity-preview')
    const previewTwo = run(app, '--identity-preview')
    assert.equal(previewOne.status, 0, previewOne.stderr)
    assert.equal(previewTwo.status, 0, previewTwo.stderr)
    assert.equal(previewOne.stdout, previewTwo.stdout, 'preview is deterministic for the same source')
    assert.equal(readFileSync(catalog, 'utf8'), catalogBefore, 'preview must not touch an existing catalog')
    assert.equal(run(app, '--check').status, 0, 'durable catalog checking remains usable')
    assert.equal(run(app, '--probe').status, 0, 'durable catalog probing remains usable')
    assert.equal(run(app, '--write').status, 0, 'durable catalog refresh remains usable')
    assert.equal(readFileSync(catalog, 'utf8'), catalogBefore)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
