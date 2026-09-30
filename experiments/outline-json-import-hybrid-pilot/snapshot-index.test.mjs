import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSnapshot, resolveAnchors } from './snapshot-index.mjs'

test('snapshot addresses may churn; only ambiguous or missing reviewed anchors need attention', () => {
  const project = mkdtempSync(join(tmpdir(), 'sourcespec-outline-hybrid-'))
  const routePath = join(project, 'server/routes/api/imports/imports.ts')
  const taskPath = join(project, 'server/queues/tasks/APIImportTask.ts')
  const uiPath = join(project, 'app/scenes/Settings/components/ImportListItem.tsx')
  const route = 'const router = { post(...args: unknown[]) {} };\nrouter.post("imports.create", async (ctx) => { ctx.body = {}; });\n'
  const task = 'class APIImportTask { onCompletion() { return true } }\n'
  const anchors = [
    { id: 'route', scope: 'server', file: 'routes/api/imports/imports.ts', selector: { kind: 'route-callback', method: 'post', operation: 'imports.create' } },
    { id: 'completion', scope: 'server', file: 'queues/tasks/APIImportTask.ts', selector: { kind: 'method', class: 'APIImportTask', member: 'onCompletion' } },
    { id: 'ui', scope: 'app', file: 'scenes/Settings/components/ImportListItem.tsx', selector: { kind: 'bound-call-argument', variable: 'ImportListItem', callee: 'observer', argument: 0 } },
  ]
  try {
    mkdirSync(join(project, 'server/routes/api/imports'), { recursive: true })
    mkdirSync(join(project, 'server/queues/tasks'), { recursive: true })
    mkdirSync(join(project, 'app/scenes/Settings/components'), { recursive: true })
    writeFileSync(routePath, route)
    writeFileSync(taskPath, task)
    writeFileSync(uiPath, 'const ImportListItem = observer(() => "Processing");\n')
    const before = buildSnapshot(project, 'server')
    const original = resolveAnchors(before, anchors)
    assert.deepEqual(original.map((item) => item.status), ['unique', 'unique'])
    assert.deepEqual(buildSnapshot(project, 'server').entries.map(({ record }) => record.id),
      before.entries.map(({ record }) => record.id), 'the same snapshot has the same exact addresses')
    assert.equal(resolveAnchors(buildSnapshot(project, 'app'), anchors)[0].status, 'unique')
    assert.throws(() => resolveAnchors(before, [{ ...anchors[0], scope: 'servre' }]), /unknown scope/)
    assert.throws(() => resolveAnchors(before, [anchors[0], { ...anchors[1], id: 'route' }]), /Duplicate anchor ID/)

    // A source position is an exact snapshot address, not a stable cross-revision ID.
    writeFileSync(routePath, 'const unrelated = () => false;\n' + route)
    const inserted = buildSnapshot(project, 'server')
    const afterInsertion = resolveAnchors(inserted, anchors)
    assert.notEqual(inserted.snapshot, before.snapshot)
    assert.notEqual(afterInsertion[0].matches[0], original[0].matches[0])
    assert.deepEqual(afterInsertion.map((item) => item.status), ['unique', 'unique'])
    assert.equal(inserted.entries.length, before.entries.length + 1)
    writeFileSync(uiPath, 'const unrelated = () => false;\nconst ImportListItem = observer(() => "Processing");\n')
    assert.equal(resolveAnchors(buildSnapshot(project, 'app'), anchors)[0].status, 'unique')
    writeFileSync(uiPath, 'const RenamedListItem = observer(() => "Processing");\n')
    assert.equal(resolveAnchors(buildSnapshot(project, 'app'), anchors)[0].status, 'missing')

    writeFileSync(taskPath, task.replace('onCompletion', 'onFinish'))
    assert.deepEqual(resolveAnchors(buildSnapshot(project, 'server'), anchors).map((item) => item.status), ['unique', 'missing'])
    writeFileSync(taskPath, task)
    writeFileSync(routePath, route + 'router.post("imports.create", async (ctx) => { ctx.body = {}; });\n')
    assert.deepEqual(resolveAnchors(buildSnapshot(project, 'server'), anchors).map((item) => item.status), ['ambiguous', 'unique'])
    writeFileSync(routePath, 'const router = { post(...args: unknown[]) {} };\nrouter.post("imports.other", async (ctx) => { ctx.body = {}; });\n')
    assert.deepEqual(resolveAnchors(buildSnapshot(project, 'server'), anchors).map((item) => item.status), ['missing', 'unique'])
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
