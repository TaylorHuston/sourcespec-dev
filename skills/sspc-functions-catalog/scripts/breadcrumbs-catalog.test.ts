import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const skill = fileURLToPath(new URL('../', import.meta.url))
const runner = join(skill, 'node_modules/.bin/tsx')
const script = join(skill, 'scripts/functions-catalog.ts')
const run = (app: string, mode: string) => spawnSync(runner, [script, '--app', app, mode], { encoding: 'utf8' })
const scoped = (project: string, scope: string, mode: string) =>
  spawnSync(runner, [script, '--project', project, '--scope', scope, mode], { encoding: 'utf8' })

test('opt-in readable lexical YAML uses preview IDs but never overwrites or silently refreshes linked candidates', () => {
  const app = mkdtempSync(join(tmpdir(), 'sspc-breadcrumbs-'))
  const source = join(app, 'src/index.ts')
  const catalog = join(app, '.sourcespec/catalogs/functions-catalog.yaml')
  try {
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'package.json'), '{"name":"breadcrumb-fixture","private":true}')
    writeFileSync(join(app, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(source, 'export class Example { get state() { return 1 } set state(value: number) {} }\nexport const group = [() => 1, () => 2];\nvoid (() => 3);\n')
    const preview = run(app, '--identity-preview')
    assert.equal(preview.status, 0, preview.stderr)
    const keys = JSON.parse(preview.stdout).functions as { id: string; context: string }[]
    assert.equal(keys.length, 5)
    assert.equal(run(app, '--check-breadcrumbs').status, 1, 'missing YAML is stale')
    const generated = run(app, '--write-breadcrumbs')
    assert.equal(generated.status, 0, generated.stderr)
    let before = readFileSync(catalog, 'utf8')
    assert.match(before, /^# Readable lexical IDs;/)
    const entries = YAML.parse(before).functions as { id: string; context?: string; name?: string }[]
    assert.deepEqual(entries.map((entry) => entry.id), keys.map((entry) => entry.id))
    assert.equal(new Set(entries.map((entry) => entry.id)).size, 5)
    assert(entries.every((entry) => entry.id.startsWith('fn:src/index.ts#')))
    assert.equal(entries.filter((entry) => entry.name === 'state' && entry.context?.includes('@utf16:')).length, 2)
    assert.equal(run(app, '--check-breadcrumbs').status, 0)
    before = before.replace('    name: state\n', '    name: state\n    description: Reviewed property behavior.\n')
    writeFileSync(catalog, before)
    assert.equal(run(app, '--check-breadcrumbs').status, 0, 'the checker preserves reviewed annotations')
    assert.equal(run(app, '--check').status, 0)
    assert.equal(run(app, '--write-breadcrumbs').status, 1, 'a repeat write must not overwrite a catalog with potential links')
    assert.equal(readFileSync(catalog, 'utf8'), before)

    writeFileSync(source, 'const inserted = () => true;\n' + readFileSync(source, 'utf8'))
    assert.equal(run(app, '--check-breadcrumbs').status, 1, 'range movement makes the catalog stale')
    assert.equal(run(app, '--write-breadcrumbs').status, 1)
    assert.equal(readFileSync(catalog, 'utf8'), before, 'no automatic remap or overwrite')
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('root tooling and separately owned mocks remain disjoint; an existing durable catalog is protected', () => {
  const project = mkdtempSync(join(tmpdir(), 'sspc-breadcrumb-scopes-'))
  try {
    mkdirSync(join(project, 'server/__mocks__'), { recursive: true })
    mkdirSync(join(project, 'app'), { recursive: true })
    writeFileSync(join(project, 'package.json'), '{"name":"scoped-breadcrumbs","private":true}')
    writeFileSync(join(project, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}')
    writeFileSync(join(project, 'build.js'), 'export function build() { return true }\n')
    writeFileSync(join(project, 'app/index.ts'), 'export function twin() { return true }\n')
    writeFileSync(join(project, 'server/index.ts'), 'export function twin() { return true }\n')
    writeFileSync(join(project, 'server/__mocks__/console.js'), 'global.console.warn = () => {}\n')
    const serverTwin = JSON.parse(scoped(project, 'server', '--identity-preview').stdout).functions
      .find((entry: { name: string }) => entry.name === 'twin').id
    const appTwin = JSON.parse(scoped(project, 'app', '--identity-preview').stdout).functions
      .find((entry: { name: string }) => entry.name === 'twin').id
    assert.equal(serverTwin, 'fn:server/index.ts#twin')
    assert.equal(appTwin, 'fn:app/index.ts#twin')
    assert.notEqual(serverTwin, appTwin, 'equal relative paths and names in sibling scopes must not share an ID')
    const legacyApp = join(project, 'app')
    assert.equal(run(legacyApp, '--write').status, 1, 'standalone scope lacks its own manifest')
    assert.equal(scoped(project, '@root', '--write-breadcrumbs').status, 0)
    assert.equal(scoped(project, '@root', '--check-breadcrumbs').status, 0)
    const rootCatalog = YAML.parse(readFileSync(join(project, '.sourcespec/catalogs/functions-catalog-root.yaml'), 'utf8')).functions
    assert.equal(rootCatalog.length, 1)
    assert.equal(rootCatalog[0].sourceScope, 'tooling')
    assert.equal(scoped(project, 'server/__mocks__', '--write-breadcrumbs').status, 0)
    const mockCatalog = YAML.parse(readFileSync(join(project, 'server/__mocks__/.sourcespec/catalogs/functions-catalog.yaml'), 'utf8')).functions
    assert.equal(mockCatalog.length, 1)
    assert.equal(mockCatalog[0].sourceScope, 'test')
    assert(mockCatalog.every((entry: { location: string }) => !entry.location.includes('app/')))

    assert.equal(scoped(project, 'app', '--write').status, 0)
    const appCatalog = join(project, 'app/.sourcespec/catalogs/functions-catalog.yaml')
    const original = readFileSync(appCatalog, 'utf8')
    assert.equal(scoped(project, 'app', '--write-breadcrumbs').status, 1)
    assert(existsSync(appCatalog))
    assert.equal(readFileSync(appCatalog, 'utf8'), original)
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
