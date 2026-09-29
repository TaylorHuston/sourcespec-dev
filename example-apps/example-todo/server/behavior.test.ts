import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { expect, it } from 'vitest'

const behaviorFile = fileURLToPath(new URL('../.sourcespec/behaviors/add-task.yaml', import.meta.url))
const functionsFile = fileURLToPath(new URL('../.sourcespec/catalogs/functions-catalog.yaml', import.meta.url))
const testsFile = fileURLToPath(new URL('../.sourcespec/catalogs/tests-catalog.yaml', import.meta.url))

it('resolves behavior case links against the app catalogs', () => {
  const behavior = parse(readFileSync(behaviorFile, 'utf8')) as {
    cases: {
      id: string
      implementedBy: { function: string; role: string }[]
      verifiedBy: { test: string; checks: string }[]
      steps?: unknown
      apiOperations?: unknown
    }[]
  }
  const functionIds = new Set((parse(readFileSync(functionsFile, 'utf8')) as { functions: { id: string }[] }).functions.map((entry) => entry.id))
  const testIds = new Set((parse(readFileSync(testsFile, 'utf8')) as { tests: { id: string }[] }).tests.map((entry) => entry.id))

  expect(behavior.cases.length).toBeGreaterThan(0)
  expect(new Set(behavior.cases.map((entry) => entry.id)).size).toBe(behavior.cases.length)
  for (const entry of behavior.cases) {
    expect(entry).not.toHaveProperty('steps')
    expect(entry).not.toHaveProperty('apiOperations')
    for (const link of entry.implementedBy) {
      expect(functionIds.has(link.function), `Unknown function ID: ${link.function}`).toBe(true)
      expect(link.role.length).toBeGreaterThan(0)
    }
    for (const link of entry.verifiedBy) {
      expect(testIds.has(link.test), `Unknown test ID: ${link.test}`).toBe(true)
      expect(link.checks.length).toBeGreaterThan(0)
    }
  }
})
