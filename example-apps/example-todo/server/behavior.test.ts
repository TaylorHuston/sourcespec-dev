import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { expect, it } from 'vitest'

const behaviorDirectory = fileURLToPath(new URL('../.sourcespec/behaviors/', import.meta.url))
const functionsFile = fileURLToPath(new URL('../.sourcespec/catalogs/functions-catalog.yaml', import.meta.url))
const testsFile = fileURLToPath(new URL('../.sourcespec/catalogs/tests-catalog.yaml', import.meta.url))

it('resolves behavior case links against the app catalogs', () => {
  type Case = { id: string; implementedBy: { function: string; role: string }[];
    verifiedBy: { test: string; checks: string }[]; steps?: unknown; apiOperations?: unknown }
  const functionIds = new Set((parse(readFileSync(functionsFile, 'utf8')) as { functions: { id: string }[] }).functions.map((entry) => entry.id))
  const testIds = new Set((parse(readFileSync(testsFile, 'utf8')) as { tests: { id: string }[] }).tests.map((entry) => entry.id))

  for (const file of readdirSync(behaviorDirectory).filter((name) => name.endsWith('.yaml'))) {
    const behavior = parse(readFileSync(`${behaviorDirectory}/${file}`, 'utf8')) as { cases: Case[] }
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
  }
})
