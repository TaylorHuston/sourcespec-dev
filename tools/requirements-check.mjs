import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
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
const validateTest = new Ajv2020({ allErrors: true }).compile(parseFile(fileURLToPath(new URL('../schema/tests.yaml', import.meta.url))))
const functions = parseFile(join(appRoot, '.sourcespec/catalogs/functions-catalog.yaml'))
const tests = parseFile(join(appRoot, '.sourcespec/catalogs/tests-catalog.yaml'))
const functionIds = new Set(functions.functions.map((entry) => entry.id))
const testEntries = new Map(tests.tests.map((entry) => [entry.id, entry]))
const testDeclarationsByFile = new Map()
const issues = []

const declarationKey = (suite, name) => JSON.stringify([suite, name])
const lexicalSegment = (text) => text.normalize('NFKC').replace(/[^A-Za-z0-9_$.-]+/g, '-')
  .replace(/^[.-]+|[.-]+$/g, '') || 'unnamed'
const testId = (location, suite, name) =>
  `test:${location.split('/').map(lexicalSegment).join('/')}#${[...suite, name].map(lexicalSegment).join('.')}`
const modifiers = new Set(['only', 'skip', 'todo', 'concurrent', 'sequential', 'failing'])
function calleeFor(expression, aliases) {
  if (ts.isIdentifier(expression)) {
    const root = aliases.get(expression.text)
    return root ? { root, each: false, bound: true } : null
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const base = calleeFor(expression.expression, aliases)
    if (!base) return null
    if (expression.name.text === 'each' && !base.each) return { ...base, each: true, bound: false }
    if (modifiers.has(expression.name.text) && base.bound) return base
    return null
  }
  if (ts.isCallExpression(expression) || ts.isTaggedTemplateExpression(expression)) {
    const factory = calleeFor(ts.isCallExpression(expression) ? expression.expression : expression.tag, aliases)
    return factory?.each && !factory.bound ? { ...factory, bound: true } : null
  }
  return null
}
function discoveredTests(location) {
  if (testDeclarationsByFile.has(location)) return testDeclarationsByFile.get(location)
  const file = resolve(appRoot, location)
  if (!file.startsWith(`${appRoot}${sep}`) || !existsSync(file)) {
    issues.push(`Test source is missing or outside the app: ${location}`)
    return new Set()
  }
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const aliases = new Map([['it', 'test'], ['test', 'test'], ['describe', 'describe']])
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const named = statement.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    const provider = ['vitest', '@jest/globals', 'node:test', 'bun:test'].includes(statement.moduleSpecifier.text)
    for (const element of named.elements) {
      const original = element.propertyName?.text ?? element.name.text
      if (!['it', 'test', 'describe'].includes(original)) continue
      if (provider) aliases.set(element.name.text, original === 'describe' ? 'describe' : 'test')
      else aliases.delete(element.name.text)
    }
  }
  const declarations = new Set()
  function titleFor(call) {
    const title = call.arguments[0]
    if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title)) && title.text.trim()) {
      return title.text
    }
    issues.push(`Nonliteral or empty test/suite name in ${location}`)
    return null
  }
  function suitesFor(node) {
    const suites = []
    let child = node
    for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
      if (!ts.isCallExpression(parent) || !parent.arguments.includes(child)) continue
      const callee = calleeFor(parent.expression, aliases)
      if (callee?.root === 'describe' && callee.bound) {
        const title = titleFor(parent)
        if (title) suites.unshift(title)
      }
    }
    return suites
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = calleeFor(node.expression, aliases)
      if (callee?.root === 'test' && callee.bound) {
        const name = titleFor(node)
        if (name) {
          const key = declarationKey(suitesFor(node), name)
          if (declarations.has(key)) issues.push(`Duplicate test declaration in ${location}: ${name}`)
          declarations.add(key)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  testDeclarationsByFile.set(location, declarations)
  return declarations
}

// Check the whole test inventory, including suites, not just tests cited by a Requirement.
function testFiles(directory = appRoot) {
  const ignored = new Set(['.git', '.sourcespec', '.data', '.next', '.turbo', 'node_modules',
    'dist', 'build', 'coverage', 'storybook-static', 'test-results', 'playwright-report'])
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : testFiles(path)
    const location = relative(appRoot, path)
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) &&
      (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) || /(?:^|\/)(?:__tests__|tests?)\//.test(location))
      ? [location] : []
  })
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
      } else if (!discoveredTests(test.location).has(declarationKey(test.suite ?? [], test.name))) {
        issues.push(`${context}: test ${link.test} (${test.name}) is not discoverable in ${test.location}`)
      }
    }
  }
}
const catalogKeys = new Set()
if (testEntries.size !== tests.tests.length) issues.push('Duplicate test IDs in the test catalog')
for (const test of tests.tests) {
  if (!validateTest(test)) {
    issues.push(`Invalid test record ${test.id}: ${JSON.stringify(validateTest.errors)}`)
    continue
  }
  const declaration = declarationKey(test.suite ?? [], test.name)
  const key = JSON.stringify([test.location, declaration])
  if (catalogKeys.has(key)) issues.push(`Duplicate catalog test declaration: ${test.location} (${declaration})`)
  catalogKeys.add(key)
  if (test.id !== testId(test.location, test.suite ?? [], test.name)) {
    issues.push(`Nonlexical test ID ${test.id}: expected ${testId(test.location, test.suite ?? [], test.name)}`)
  }
  if (!discoveredTests(test.location).has(declaration)) {
    issues.push(`Catalog test ${test.id} (${test.name}) is not declared in ${test.location}`)
  }
}
for (const location of testFiles()) {
  for (const declaration of discoveredTests(location)) {
    if (!catalogKeys.has(JSON.stringify([location, declaration]))) {
      issues.push(`Uncataloged test declaration: ${location} (${declaration})`)
    }
  }
}
if (issues.length) {
  console.error(`Requirement and test-catalog check failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`${files.length} Requirements and ${scenarioCount} Scenarios match the schema; catalog links and all ${catalogKeys.size} test declarations resolve.`)
}
