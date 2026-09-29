import { randomUUID } from 'node:crypto'
import { builtinModules, createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Ajv2020 } from 'ajv/dist/2020.js'
import skillTs from 'typescript'
import type * as TS from 'typescript'
import YAML from 'yaml'

type FunctionNode = TS.FunctionDeclaration | TS.FunctionExpression | TS.ArrowFunction |
  TS.MethodDeclaration | TS.ConstructorDeclaration | TS.GetAccessorDeclaration | TS.SetAccessorDeclaration

type Parameter = { name: string; type: string; required: boolean; description?: string; default?: string }
type SourceScope = 'application' | 'test' | 'tooling' | 'unclassified'
type FunctionRecord = {
  id: string
  name: string | null
  location: string
  sourceScope: SourceScope
  context?: string
  description?: string
  parameters: Parameter[]
  return: { type: string; description?: string }
}

const [appFlag, appPath, mode] = process.argv.slice(2)
if (appFlag !== '--app' || !appPath || !['--check', '--write'].includes(mode) || process.argv.length !== 5) {
  throw new Error('Usage: functions-catalog.ts --app <absolute-app-root> --check|--write')
}
if (appPath !== resolve(appPath)) throw new Error('--app must be an absolute path')
const appRoot = realpathSync(appPath)
if (!existsSync(join(appRoot, 'package.json')) || !existsSync(join(appRoot, 'tsconfig.json'))) {
  throw new Error('--app needs an application package.json and tsconfig.json')
}
if (existsSync(join(appRoot, 'pnpm-workspace.yaml'))) {
  throw new Error('Pass a single app root (such as apps/api), not the monorepo root')
}

// Use the app's installed TypeScript when present; inference otherwise drifts across compiler versions.
const requireFromApp = createRequire(join(appRoot, 'package.json'))
let ts: typeof skillTs = skillTs
try {
  ts = requireFromApp('typescript') as typeof skillTs
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error
}

const catalogFile = join(appRoot, '.sourcespec/catalogs/functions-catalog.yaml')
const schemaFile = fileURLToPath(new URL('../assets/functions.schema.yaml', import.meta.url))
const validate = new Ajv2020({ allErrors: true }).compile(YAML.parse(readFileSync(schemaFile, 'utf8')))

function readCatalog(): FunctionRecord[] {
  if (!existsSync(catalogFile)) return []
  const document: unknown = YAML.parse(readFileSync(catalogFile, 'utf8'))
  if (!document || typeof document !== 'object' || !('functions' in document) ||
      !Array.isArray(document.functions)) throw new Error('Expected a functions array in the existing catalog')
  const ids = new Set<string>()
  for (const entry of document.functions) {
    // Accept only the previous missing-field shape while migrating older catalogs.
    const candidate = entry && typeof entry === 'object' && !('sourceScope' in entry)
      ? { ...entry, sourceScope: 'unclassified' } : entry
    if (!validate(candidate)) throw new Error(`Invalid catalog function: ${JSON.stringify(validate.errors)}`)
    const record = entry as FunctionRecord
    if (typeof record.location !== 'string') throw new Error('Catalog function location is missing')
    if (ids.has(record.id)) throw new Error(`Duplicate function ID: ${record.id}`)
    ids.add(record.id)
  }
  return document.functions as FunctionRecord[]
}

const ignored = new Set(['.git', '.sourcespec', '.data', '.next', '.turbo', 'node_modules',
  'dist', 'build', 'coverage', 'storybook-static', 'test-results', 'playwright-report'])
function sourceFiles(directory = appRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : sourceFiles(join(directory, entry.name))
    if (!entry.isFile() || /\.d\.[cm]?ts$/.test(entry.name)) return []
    return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) ? [join(directory, entry.name)] : []
  }).sort()
}

function isFunction(node: TS.Node): node is FunctionNode {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
}

function declaredName(node: FunctionNode): string | null {
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  return node.name?.getText() ?? null
}

function expressionLabel(node: TS.Node, source: TS.SourceFile): string {
  if (ts.isPropertyAccessExpression(node)) return `${expressionLabel(node.expression, source)}.${node.name.text}`
  if (ts.isCallExpression(node)) {
    const argumentsHint = node.arguments.filter((argument) => !isFunction(argument))
      .map((argument) => ts.isStringLiteral(argument) ? argument.text : expressionLabel(argument, source)).join(', ')
    return `${expressionLabel(node.expression, source)}(${argumentsHint})`
  }
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
    return expressionLabel(node.expression, source)
  }
  return node.getText(source).replace(/\s+/g, ' ').slice(0, 100)
}

function contextFor(node: FunctionNode, source: TS.SourceFile): string {
  const labels: string[] = []
  let child: TS.Node = node
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(child as TS.Expression)) {
      const literal = parent.arguments.find(ts.isStringLiteral)
      const bodyCall = ts.isNewExpression(parent) && node.body && ts.isCallExpression(node.body)
        ? ` > invokes ${expressionLabel(node.body.expression, source)}` : ''
      const dependencies = ts.isCallExpression(parent) && expressionLabel(parent.expression, source) === 'useEffect'
        ? ` dependencies ${parent.arguments[1]?.getText(source) ?? 'unknown'}` : ''
      labels.push(`${ts.isNewExpression(parent) ? 'new ' : ''}${expressionLabel(parent.expression, source)}${literal ? `(${literal.text})` : ''}${dependencies}${bodyCall}`)
    } else if (ts.isJsxAttribute(parent) && parent.initializer === child) {
      const element = parent.parent?.parent
      const id = element && (ts.isJsxSelfClosingElement(element) || ts.isJsxOpeningElement(element))
        ? element.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source) === 'id') : undefined
      const idHint = id && ts.isJsxAttribute(id) && id.initializer && ts.isStringLiteral(id.initializer)
        ? `#${id.initializer.text}` : ''
      labels.push(`${parent.name.getText(source)} attribute${idHint}`)
    } else if (ts.isPropertyAssignment(parent) && parent.initializer === child) {
      labels.push(`${parent.name.getText(source)} property`)
    } else if (ts.isVariableDeclaration(parent) && parent.initializer === child) {
      labels.push(`${parent.name.getText(source)} variable`)
    } else if (ts.isReturnStatement(parent) && parent.expression === child) {
      labels.push('return')
    } else if (isFunction(parent) && declaredName(parent)) {
      labels.push(declaredName(parent)!)
    } else if (ts.isClassDeclaration(parent) && parent.name) {
      labels.push(parent.name.text)
    }
  }
  return labels.reverse().join(' > ')
}

const nodeBuiltins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))
function stableParameterType(type: string): string {
  return type.replace(/import\("([^"]+)"\)/g, (original, moduleName: string) =>
    nodeBuiltins.has(moduleName) ? `import("node:${moduleName}")` : original)
}

function sourceScopeFor(location: string): SourceScope {
  if (/(?:^|\/)(?:__tests__|tests?)\//.test(location) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(location)) return 'test'
  if (/(?:^|\/)(?:scripts|tools)\//.test(location) || /(?:^|\/)[^/]+\.config\.[cm]?[jt]sx?$/.test(location)) return 'tooling'
  if (/^(?:src|server|app|lib)\//.test(location)) return 'application'
  return 'unclassified'
}

function conciseType(type: TS.Type, node: TS.Node, checker: TS.TypeChecker): string {
  const flags = type.flags
  if (flags & ts.TypeFlags.Any) return 'any'
  if (flags & ts.TypeFlags.Unknown) return 'unknown'
  if (flags & ts.TypeFlags.Never) return 'never'
  if (flags & ts.TypeFlags.Void) return 'void'
  if (flags & ts.TypeFlags.Undefined) return 'undefined'
  if (flags & ts.TypeFlags.Null) return 'null'
  if (flags & ts.TypeFlags.StringLike) return 'string'
  if (flags & ts.TypeFlags.NumberLike) return 'number'
  if (flags & ts.TypeFlags.BooleanLike) return 'boolean'
  if (flags & ts.TypeFlags.BigIntLike) return 'bigint'
  if (flags & ts.TypeFlags.ESSymbolLike) return 'symbol'
  if (type.isUnion()) return [...new Set(type.types.map((part) => conciseType(part, node, checker)))].join(' | ')
  if (type.isIntersection()) return [...new Set(type.types.map((part) => conciseType(part, node, checker)))].join(' & ')
  if (flags & ts.TypeFlags.TypeParameter) return checker.typeToString(type, node)
  if (checker.isArrayType(type)) {
    const [item] = checker.getTypeArguments(type as TS.TypeReference)
    return `${item ? conciseType(item, node, checker) : 'unknown'}[]`
  }
  const name = type.aliasSymbol?.name ?? type.symbol?.name
  const args = type.flags & ts.TypeFlags.Object && (type as TS.ObjectType).objectFlags & ts.ObjectFlags.Reference
    ? checker.getTypeArguments(type as TS.TypeReference) : []
  if (name === 'Promise') return `Promise<${args[0] ? conciseType(args[0], node, checker) : 'unknown'}>`
  if (name === 'Element' && checker.typeToString(type, node).includes('JSX.Element')) return 'React.JSX.Element'
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length) {
    const printed = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
    return printed.length <= 120 && !/import\(|[{}]/.test(printed) ? printed : 'function'
  }
  if (name && /^[A-Za-z_$][\w$]*$/.test(name) && !name.startsWith('__')) return name
  return 'object'
}

const config = ts.readConfigFile(join(appRoot, 'tsconfig.json'), ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, appRoot)
if (parsed.errors.length) throw new Error('Cannot parse the app tsconfig.json')
// Explicitly include tests and config even when the build tsconfig excludes them.
const files = sourceFiles()
const program = ts.createProgram(files, { ...parsed.options, allowJs: true, noEmit: true })
const checker = program.getTypeChecker()
const previous = readCatalog()
const identity = (entry: Pick<FunctionRecord, 'location' | 'name' | 'context'>) =>
  JSON.stringify([entry.location, entry.name, entry.context ?? ''])
const byIdentity = new Map<string, FunctionRecord>()
for (const entry of previous) {
  const key = identity(entry)
  if (byIdentity.has(key)) throw new Error(`Ambiguous existing catalog identity: ${key}`)
  byIdentity.set(key, entry)
}
function hasSeparatedEntries(text: string, count: number): boolean {
  const lines = text.split(/\r?\n/)
  const starts = lines.flatMap((line, index) => line.startsWith('  - id:') ? [index] : [])
  return starts.length === count && starts.every((index, position) => position === 0 ||
    (lines[index - 1] === '' && lines[index - 2] !== ''))
}

function formatCatalog(records: FunctionRecord[]): string {
  let first = true
  const body = YAML.stringify({ functions: records }, { lineWidth: 110 }).replace(/^  - id:/gm, (line) => {
    if (first) {
      first = false
      return line
    }
    return `\n${line}`
  })
  return '# Generated app-owned function inventory. Review ID reconciliation after refactors.\n' + body
}

const seen = new Set<string>()
const used = new Set<string>()
const records: FunctionRecord[] = []
let added = 0
for (const file of files) {
  const source = program.getSourceFile(file)
  if (!source) throw new Error(`Cannot parse app source ${relative(appRoot, file)}`)
  function visit(node: TS.Node): void {
    if (isFunction(node)) {
      const name = declaredName(node)
      const context = contextFor(node, source!)
      const location = relative(appRoot, file)
      const key = identity({ location, name, context })
      if (seen.has(key)) throw new Error(`Ambiguous function identity ${key}; review the source`)
      seen.add(key)
      if (!name && !context) throw new Error(`Anonymous function without searchable context: ${location}`)
      const old = byIdentity.get(key)
      if (old) used.add(old.id)
      else added++
      const signature = checker.getSignatureFromDeclaration(node)
      const inferredReturn = signature ? conciseType(checker.getReturnTypeOfSignature(signature), node, checker) : 'unknown'
      const returnType = old?.description && old.return?.type && !/import\(|[{};\n]/.test(old.return.type)
        ? old.return.type : inferredReturn
      const parameters: Parameter[] = node.parameters.map((parameter) => {
        const parameterName = parameter.name.getText(source)
        const oldParameter = old?.parameters.find((item) => item.name === parameterName)
        return {
          name: parameterName,
          type: stableParameterType(checker.typeToString(checker.getTypeAtLocation(parameter), node, ts.TypeFormatFlags.NoTruncation)),
          ...(oldParameter?.description ? { description: oldParameter.description } : {}),
          ...(oldParameter?.default ? { default: oldParameter.default } : {}),
          required: !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken,
        }
      })
      const record: FunctionRecord = {
        id: old?.id ?? `fn-${randomUUID()}`,
        name,
        ...(old?.description ? { description: old.description } : {}),
        location,
        sourceScope: old?.sourceScope ?? sourceScopeFor(location),
        ...(context ? { context } : {}),
        parameters,
        return: {
          type: returnType,
          ...(old?.return.description ? { description: old.return.description } : {}),
        },
      }
      if (!validate(record)) throw new Error(`Generated invalid function: ${JSON.stringify(validate.errors)}`)
      records.push(record)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const missing = previous.filter((entry) => !used.has(entry.id))
if (missing.length) {
  throw new Error(`Unmatched prior IDs: ${missing.map((entry) => entry.id).join(', ')}. Review moves/removals and links; this pilot never prunes automatically.`)
}
function reportAmbiguities(): void {
  const unresolved = records.filter((entry) => entry.sourceScope === 'unclassified')
  if (!unresolved.length) return
  console.warn(`${unresolved.length} function source scope(s) need review:`)
  for (const entry of unresolved) {
    console.warn(`- ${entry.id}: ${entry.location} — ${entry.name ?? entry.context ?? 'anonymous function'}`)
  }
}
if (mode === '--check') {
  if (!existsSync(catalogFile) || !isDeepStrictEqual(previous, records) ||
      !hasSeparatedEntries(readFileSync(catalogFile, 'utf8'), records.length)) {
    console.error(`Function catalog is stale or lacks a blank line between entries (${added} new definitions). Refresh with --write and review the diff.`)
    process.exitCode = 1
  } else {
    console.log(`Function catalog matches ${records.length} definitions in ${files.length} app-owned files.`)
  }
} else {
  mkdirSync(dirname(catalogFile), { recursive: true })
  const temporary = `${catalogFile}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, formatCatalog(records), { flag: 'wx' })
    renameSync(temporary, catalogFile)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  console.log(`Wrote ${records.length} functions (${added} new) for ${appRoot}.`)
}
reportAmbiguities()
