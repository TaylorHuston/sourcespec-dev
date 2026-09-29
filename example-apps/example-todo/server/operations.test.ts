import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { expect, it } from 'vitest'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const fromApp = (path: string) => parse(readFileSync(join(appRoot, path), 'utf8'))

type FunctionLink = { function: string; role: string }
type TestLink = { test: string; checks: string }
type OperationMap = {
  contract: string
  mounts: { id: string; prefix: string; function: string; role: string }[]
  operations: { operationId: string; mount: string; implementedBy: FunctionLink[]; verifiedBy?: TestLink[] }[]
}

it('resolves every HTTP operation to its mount, handler, and intended tests', () => {
  const map = fromApp('.sourcespec/operations/local-http.yaml') as OperationMap
  const api = fromApp(map.contract) as { paths: Record<string, Record<string, { operationId?: string }>> }
  const functionIds = new Set((fromApp('.sourcespec/catalogs/functions-catalog.yaml') as {
    functions: { id: string }[]
  }).functions.map((entry) => entry.id))
  const testIds = new Set((fromApp('.sourcespec/catalogs/tests-catalog.yaml') as {
    tests: { id: string }[]
  }).tests.map((entry) => entry.id))

  const httpMethods = new Set(['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'])
  const contractOperations = Object.entries(api.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).filter(([method]) => httpMethods.has(method))
      .map(([, operation]) => ({ path, id: operation.operationId })),
  )
  const contractIds = contractOperations.map((entry) => entry.id)
  const mappedIds = map.operations.map((entry) => entry.operationId)
  expect(contractIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
  expect(new Set(contractIds).size).toBe(contractIds.length)
  expect(new Set(mappedIds).size).toBe(mappedIds.length)
  expect(new Set(mappedIds)).toEqual(new Set(contractIds))
  expect(new Set(map.mounts.map((mount) => mount.id)).size).toBe(map.mounts.length)
  for (const mount of map.mounts) {
    expect(functionIds.has(mount.function), `Unknown mount function: ${mount.function}`).toBe(true)
    expect(mount.role.length).toBeGreaterThan(0)
  }
  for (const operation of map.operations) {
    const mount = map.mounts.find((entry) => entry.id === operation.mount)
    const contractPath = contractOperations.find((entry) => entry.id === operation.operationId)?.path
    expect(mount, `Unknown mount: ${operation.mount}`).toBeDefined()
    expect(contractPath, `Unknown operation: ${operation.operationId}`).toBeDefined()
    expect(contractPath === mount?.prefix || contractPath?.startsWith(`${mount?.prefix}/`)).toBe(true)
    expect(operation.implementedBy.length).toBeGreaterThan(0)
    for (const link of operation.implementedBy) {
      expect(functionIds.has(link.function), `Unknown handler function: ${link.function}`).toBe(true)
      expect(link.role.length).toBeGreaterThan(0)
    }
    for (const link of operation.verifiedBy ?? []) {
      expect(testIds.has(link.test), `Unknown test: ${link.test}`).toBe(true)
      expect(link.checks.length).toBeGreaterThan(0)
    }
  }
})
