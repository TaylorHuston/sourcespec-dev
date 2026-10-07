import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import YAML from 'yaml'
import { readInstalledSchema } from './schema.js'

type Scenario = {
  id: string
  implementedBy?: { function: string }[]
  verifiedBy?: { test: string }[]
}
type Requirement = { id: string; scenarios: Scenario[] }

const [appFlag, appPath, mode] = process.argv.slice(2)
if (appFlag !== '--app' || !appPath || appPath !== resolve(appPath) || mode !== '--check' || process.argv.length !== 5) {
  throw new Error('Usage: sourcespec sspc-requirements check --app <absolute-app-root>')
}
const appRoot = realpathSync(appPath)
const parseFile = (path: string): unknown => YAML.parse(readFileSync(path, 'utf8'))
const ajv = new Ajv2020({ allErrors: true })
const validate = ajv.compile(readInstalledSchema('requirements'))
const validateTest = ajv.compile(readInstalledSchema('tests'))
const validateFunction = ajv.compile(readInstalledSchema('functions'))
const functionCatalog = parseFile(join(appRoot, '.sourcespec/catalogs/functions-catalog.yaml')) as { functions: unknown[] }
const testCatalog = parseFile(join(appRoot, '.sourcespec/catalogs/tests-catalog.yaml')) as { tests: unknown[] }
if (!Array.isArray(functionCatalog?.functions) || !Array.isArray(testCatalog?.tests)) {
  throw new Error('Expected functions and tests arrays in the app catalogs')
}
const functionIds = new Set<string>()
const testIds = new Set<string>()
const issues: string[] = []
for (const entry of functionCatalog.functions) {
  if (!validateFunction(entry)) {
    issues.push(`Invalid function catalog record: ${JSON.stringify(validateFunction.errors)}`)
    continue
  }
  const id = (entry as { id: string }).id
  if (functionIds.has(id)) issues.push(`Duplicate function ID ${id}`)
  functionIds.add(id)
}
for (const entry of testCatalog.tests) {
  if (!validateTest(entry)) {
    issues.push(`Invalid test catalog record: ${JSON.stringify(validateTest.errors)}`)
    continue
  }
  const id = (entry as { id: string }).id
  if (testIds.has(id)) issues.push(`Duplicate test ID ${id}`)
  testIds.add(id)
}
const directory = join(appRoot, '.sourcespec/requirements')
const files = readdirSync(directory).filter((name) => name.endsWith('.yaml')).sort()
if (!files.length) issues.push('No Requirement records found')
const ids = new Set<string>()
let scenarioCount = 0
for (const file of files) {
  let requirement: unknown
  try {
    requirement = parseFile(join(directory, file))
  } catch (error) {
    issues.push(`${file}: cannot parse YAML: ${error instanceof Error ? error.message : String(error)}`)
    continue
  }
  if (!validate(requirement)) {
    for (const error of validate.errors ?? []) issues.push(`${file}${error.instancePath || '/'}: ${error.message}`)
    continue
  }
  const record = requirement as Requirement
  if (file !== `${record.id}.yaml`) issues.push(`${file}: filename must match ${record.id}.yaml`)
  if (ids.has(record.id)) issues.push(`${file}: duplicate Requirement ID ${record.id}`)
  ids.add(record.id)
  const scenarioIds = new Set<string>()
  for (const scenario of record.scenarios) {
    scenarioCount++
    const context = `${file}#${scenario.id}`
    if (scenarioIds.has(scenario.id)) issues.push(`${context}: duplicate Scenario ID`)
    scenarioIds.add(scenario.id)
    for (const link of scenario.implementedBy ?? []) {
      if (!functionIds.has(link.function)) issues.push(`${context}: unknown function ${link.function}`)
    }
    for (const link of scenario.verifiedBy ?? []) {
      if (!testIds.has(link.test)) issues.push(`${context}: unknown test ${link.test}`)
    }
  }
}
if (issues.length) {
  console.error(`Requirement check failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`${files.length} Requirements and ${scenarioCount} Scenarios match the installed schema; function and test catalog links resolve.`)
}
