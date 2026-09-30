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
const script = join(skill, 'scripts/functions-catalog.ts')
const run = (app: string, mode: '--write' | '--check') =>
  spawnSync(runner, [script, '--app', app, mode], { encoding: 'utf8' })
const scoped = (project: string, scope: string, mode: '--write' | '--check') =>
  spawnSync(runner, [script, '--project', project, '--scope', scope, mode], { encoding: 'utf8' })

test('normal catalog writes lexical IDs, preserves annotations, and refuses range churn', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-lexical-'))
  const source = join(app, 'src/index.ts')
  const catalog = join(app, '.sourcespec/catalogs/functions-catalog.yaml')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"name":"lexical-fixture","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    const sourceText = 'const emoji = "😀";\nexport class Example { get state() { return 1 } set state(value: number) {} }\nexport const group = [() => 1, () => 2];\nvoid (() => 3);\n'
    writeFileSync(source, sourceText)
    assert.notEqual(run(app, '--check').status, 0, 'missing catalog is stale')
    const generated = run(app, '--write')
    assert.equal(generated.status, 0, generated.stderr)
    let before = readFileSync(catalog, 'utf8')
    const entries = YAML.parse(before).functions as { id: string; context?: string; name?: string }[]
    assert.equal(entries.length, 5)
    assert.equal(new Set(entries.map((entry) => entry.id)).size, 5)
    assert(entries.every((entry) => entry.id.startsWith('fn:src/index.ts#')))
    assert.equal(entries.filter((entry) => entry.name === 'state' && entry.context?.includes('@utf16:')).length, 2)
    const callbackStart = sourceText.indexOf('() => 1', sourceText.indexOf('export const group'))
    assert(entries.some((entry) => entry.id.includes(`@utf16:${callbackStart}-`)), 'fallback ranges count UTF-16 positions')
    assert(Buffer.byteLength(sourceText.slice(0, callbackStart)) > callbackStart, 'byte offsets differ after an emoji')
    before = before.replace('    name: state\n', '    name: state\n    description: Reviewed property behavior.\n')
    writeFileSync(catalog, before)
    assert.equal(run(app, '--check').status, 0, 'reviewed annotations remain valid')
    assert.equal(run(app, '--write').status, 0)
    assert.equal(readFileSync(catalog, 'utf8'), before, 'refresh preserves curated fields')

    writeFileSync(source, 'const inserted = () => true;\n' + readFileSync(source, 'utf8'))
    assert.notEqual(run(app, '--check').status, 0)
    assert.notEqual(run(app, '--write').status, 0)
    assert.equal(readFileSync(catalog, 'utf8'), before, 'range shifts never silently rewrite existing IDs')
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('direct root tooling and sibling scopes use distinct lexical IDs', () => {
  const project = mkdtempSync(join(tmpdir(), 'sspc-lexical-scopes-'))
  try {
    mkdirSync(join(project, 'server/__mocks__'), { recursive: true })
    mkdirSync(join(project, 'app'), { recursive: true })
    writeFileSync(join(project, 'package.json'), '{"name":"scoped-fixture","private":true}')
    writeFileSync(join(project, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(join(project, 'build.js'), 'export function build() { return true }\n')
    writeFileSync(join(project, 'app/index.ts'), 'export function twin() { return true }\n')
    writeFileSync(join(project, 'server/index.ts'), 'export function twin() { return true }\n')
    writeFileSync(join(project, 'server/__mocks__/console.js'), 'global.console.warn = () => {}\n')
    assert.equal(scoped(project, '@root', '--write').status, 0)
    assert.equal(scoped(project, '@root', '--check').status, 0)
    const rootCatalog = YAML.parse(readFileSync(join(project, '.sourcespec/catalogs/functions-catalog-root.yaml'), 'utf8')).functions
    assert.equal(rootCatalog.length, 1)
    assert.equal(rootCatalog[0].sourceScope, 'tooling')
    assert.equal(scoped(project, 'server/__mocks__', '--write').status, 0)
    const mockCatalog = YAML.parse(readFileSync(join(project, 'server/__mocks__/.sourcespec/catalogs/functions-catalog.yaml'), 'utf8')).functions
    assert.equal(mockCatalog.length, 1)
    assert.equal(mockCatalog[0].sourceScope, 'test')
    assert.equal(scoped(project, 'server', '--write').status, 0)
    assert.equal(scoped(project, 'app', '--write').status, 0)
    const serverTwin = YAML.parse(readFileSync(join(project, 'server/.sourcespec/catalogs/functions-catalog.yaml'), 'utf8')).functions
      .find((entry: { name: string }) => entry.name === 'twin').id
    const appTwin = YAML.parse(readFileSync(join(project, 'app/.sourcespec/catalogs/functions-catalog.yaml'), 'utf8')).functions
      .find((entry: { name: string }) => entry.name === 'twin').id
    assert.equal(serverTwin, 'fn:server/index.ts#twin')
    assert.equal(appTwin, 'fn:app/index.ts#twin')
    assert.notEqual(serverTwin, appTwin)
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
