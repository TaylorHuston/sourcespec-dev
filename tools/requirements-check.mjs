import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run from an example app root. Tooling outside the app does not enter its function catalog.
const appRoot = process.cwd()
const fromApp = createRequire(join(appRoot, 'package.json'))
const YAML = fromApp('yaml')
const Ajv2020 = fromApp('ajv/dist/2020').default
const ts = fromApp('typescript')
const schemaFile = fileURLToPath(new URL('../schema/requirements.yaml', import.meta.url))
const parseFile = (path) => YAML.parse(readFileSync(path, 'utf8'))
const validate = new Ajv2020({ allErrors: true }).compile(parseFile(schemaFile))
const functions = parseFile(join(appRoot, '.sourcespec/catalogs/functions-catalog.yaml'))
const tests = parseFile(join(appRoot, '.sourcespec/catalogs/tests-catalog.yaml'))
const functionIds = new Set(functions.functions.map((entry) => entry.id))
const testEntries = new Map(tests.tests.map((entry) => [entry.id, entry]))
const testNamesByFile = new Map()
const issues = []

function discoveredTests(location) {
  if (testNamesByFile.has(location)) return testNamesByFile.get(location)
  const file = resolve(appRoot, location)
  if (!file.startsWith(`${appRoot}${sep}`) || !existsSync(file)) {
    issues.push(`Test source is missing or outside the app: ${location}`)
    return new Set()
  }
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const names = new Set()
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      ['it', 'test'].includes(node.expression.text) && node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])) names.add(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  testNamesByFile.set(location, names)
  return names
}

const directory = join(appRoot, '.sourcespec/requirements')
const files = readdirSync(directory).filter((name) => name.endsWith('.yaml')).sort()
if (!files.length) issues.push('No Requirement records found')
const ids = new Set()
let scenarioCount = 0
for (const file of files) {
  let requirement
  try {
    requirement = parseFile(join(directory, file))
  } catch (error) {
    issues.push(`${file}: cannot parse YAML: ${error.message}`)
    continue
  }
  if (!validate(requirement)) {
    for (const error of validate.errors ?? []) {
      issues.push(`${file}${error.instancePath || '/'}: ${error.message}`)
    }
    continue
  }
  if (file !== `${requirement.id}.yaml`) issues.push(`${file}: filename must match ${requirement.id}.yaml`)
  if (ids.has(requirement.id)) issues.push(`${file}: duplicate Requirement ID ${requirement.id}`)
  ids.add(requirement.id)
  const scenarioIds = new Set()
  for (const scenario of requirement.scenarios) {
    scenarioCount++
    const context = `${file}#${scenario.id}`
    if (scenarioIds.has(scenario.id)) issues.push(`${context}: duplicate Scenario ID`)
    scenarioIds.add(scenario.id)
    for (const link of scenario.implementedBy ?? []) {
      if (!functionIds.has(link.function)) issues.push(`${context}: unknown function ${link.function}`)
    }
    for (const link of scenario.verifiedBy ?? []) {
      const test = testEntries.get(link.test)
      if (!test) {
        issues.push(`${context}: unknown test ${link.test}`)
      } else if (!discoveredTests(test.location).has(test.name)) {
        issues.push(`${context}: test ${link.test} (${test.name}) is not discoverable in ${test.location}`)
      }
    }
  }
}
if (issues.length) {
  console.error(`Requirement check failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`${files.length} Requirements and ${scenarioCount} Scenarios match the schema; catalog links and test declarations resolve.`)
}
