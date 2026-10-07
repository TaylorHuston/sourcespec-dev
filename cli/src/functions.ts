import { randomUUID } from 'node:crypto'
import { builtinModules, createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readInstalledSchema } from './schema.js'
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

const args = process.argv.slice(2)
const mode = args.at(-1) as '--probe' | '--check' | '--write'
const force = mode === '--write' && args.at(-2) === '--force'
const scoped = args[0] === '--project' && args[2] === '--scope' && args.length === (force ? 6 : 5)
const standalone = args[0] === '--app' && args.length === (force ? 4 : 3)
if ((!scoped && !standalone) || !['--probe', '--check', '--write'].includes(mode)) {
  throw new Error('Usage: sourcespec sspc-functions probe|check|write --app <absolute-app-root> [--force for write] OR sourcespec sspc-functions probe|check|write --project <absolute-config-root> --scope <relative-owned-directory|@root> [--force for write]')
}
const projectPath = args[1]
if (projectPath !== resolve(projectPath)) throw new Error('--app/--project must be an absolute path')
const projectRoot = realpathSync(projectPath)
if (!existsSync(join(projectRoot, 'package.json')) || !existsSync(join(projectRoot, 'tsconfig.json'))) {
  throw new Error('The project needs a package.json and tsconfig.json')
}
if (standalone && existsSync(join(projectRoot, 'pnpm-workspace.yaml'))) {
  throw new Error('Pass a single app root (such as apps/api), not the monorepo root')
}
const scopePath = scoped ? args[3] : '.'
const rootOnly = scoped && scopePath === '@root'
if (scoped && (scopePath === '.' || scopePath === '' || (!rootOnly && resolve(scopePath) === scopePath))) {
  throw new Error('--scope must be a non-root directory relative to the project or @root for direct root tooling')
}
const appRoot = rootOnly ? projectRoot : realpathSync(resolve(projectRoot, scopePath))
const ownedPath = rootOnly ? '@root' : relative(projectRoot, appRoot)
if (scoped && (!ownedPath || ownedPath === '..' || ownedPath.startsWith(`..${sep}`))) {
  throw new Error('--scope must stay inside the project root')
}

// Use the project's installed TypeScript when present; inference otherwise drifts across compiler versions.
const requireFromProject = createRequire(join(projectRoot, 'package.json'))
let ts: typeof skillTs = skillTs
let usingProjectTypescript = false
try {
  ts = requireFromProject('typescript') as typeof skillTs
  usingProjectTypescript = true
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error
}

const catalogFile = join(appRoot, `.sourcespec/catalogs/functions-catalog${rootOnly ? '-root' : ''}.yaml`)
const validate = new Ajv2020({ allErrors: true }).compile(readInstalledSchema('functions'))

function readCatalog(): FunctionRecord[] {
  if (!existsSync(catalogFile)) return []
  const document: unknown = YAML.parse(readFileSync(catalogFile, 'utf8'))
  if (!document || typeof document !== 'object' || !('functions' in document) ||
      !Array.isArray(document.functions)) throw new Error('Expected a functions array in the existing catalog')
  const ids = new Set<string>()
  for (const entry of document.functions) {
    if (!validate(entry)) throw new Error(`Invalid catalog function: ${JSON.stringify(validate.errors)}`)
    const record = entry as FunctionRecord
    if (typeof record.location !== 'string') throw new Error('Catalog function location is missing')
    if (ids.has(record.id)) throw new Error(`Duplicate function ID: ${record.id}`)
    ids.add(record.id)
  }
  return document.functions as FunctionRecord[]
}

const ignored = new Set(['.git', '.sourcespec', '.data', '.next', '.turbo', 'node_modules',
  'dist', 'build', 'coverage', 'storybook-static', 'test-results', 'playwright-report'])
const skippedDirectories: string[] = []
function sourceFiles(directory = appRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (rootOnly) return [] // Root tooling owns direct files, never sibling apps.
      if (ignored.has(entry.name)) {
        skippedDirectories.push(relative(appRoot, join(directory, entry.name)))
        return []
      }
      return sourceFiles(join(directory, entry.name))
    }
    if (!entry.isFile() || /\.d\.[cm]?ts$/.test(entry.name)) return []
    return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) ? [join(directory, entry.name)] : []
  }).sort()
}

function isSignatureOnly(node: TS.Node): node is FunctionNode {
  return (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)) && !node.body
}

function isFunction(node: TS.Node): node is FunctionNode {
  return ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) && !!node.body)
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
    } else if (ts.isBinaryExpression(parent) && parent.right === child &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      labels.push(`${parent.left.getText(source)} assignment`)
    } else if (ts.isVariableDeclaration(parent) && parent.initializer === child) {
      labels.push(`${parent.name.getText(source)} variable`)
    } else if (ts.isPropertyDeclaration(parent)) {
      labels.push(`${parent.name.getText(source)} field`)
    } else if (ts.isExportAssignment(parent) && parent.expression === child) {
      labels.push('default export')
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

function sourceScopeFor(location: string): SourceScope {
  const ownedLocation = scoped ? `${ownedPath.split(sep).join('/')}/${location}` : location
  if (/(?:^|\/)(?:__mocks__|__tests__|tests?)\//.test(ownedLocation) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(location)) return 'test'
  if (/(?:^|\/)(?:migrations|scripts|tools)\//.test(ownedLocation) || /(?:^|\/)[^/]+\.config\.[cm]?[jt]sx?$/.test(location)) return 'tooling'
  if (rootOnly || (scoped && ownedPath.startsWith('.'))) return 'tooling'
  if (scoped || /^(?:src|server|app|lib)\//.test(location)) return 'application'
  return 'unclassified'
}

function conciseType(type: TS.Type, node: TS.Node, checker: TS.TypeChecker, visiting = new Set<TS.Type>(), depth = 0): string {
  // Recursive aliases and large unions are common in brownfield code. Summarize them instead
  // of overflowing the stack or expanding a full structural type into the catalog.
  if (depth > 8 || visiting.has(type)) return 'object'
  const next = new Set(visiting).add(type)
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
  if (type.isUnion()) return type.types.length > 16 ? 'object' :
    [...new Set(type.types.map((part) => conciseType(part, node, checker, next, depth + 1)))].join(' | ')
  if (type.isIntersection()) return type.types.length > 16 ? 'object' :
    [...new Set(type.types.map((part) => conciseType(part, node, checker, next, depth + 1)))].join(' & ')
  if (flags & ts.TypeFlags.TypeParameter) return checker.typeToString(type, node)
  if (checker.isArrayType(type)) {
    const [item] = checker.getTypeArguments(type as TS.TypeReference)
    return `${item ? conciseType(item, node, checker, next, depth + 1) : 'unknown'}[]`
  }
  const name = type.aliasSymbol?.name ?? type.symbol?.name
  const args = type.flags & ts.TypeFlags.Object && (type as TS.ObjectType).objectFlags & ts.ObjectFlags.Reference
    ? checker.getTypeArguments(type as TS.TypeReference) : []
  if (name === 'Promise') return `Promise<${args[0] ? conciseType(args[0], node, checker, next, depth + 1) : 'unknown'}>`
  if (name === 'Element' && checker.typeToString(type, node).includes('JSX.Element')) return 'React.JSX.Element'
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length) {
    const printed = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
    return printed.length <= 120 && !/import\(|[{}]/.test(printed) ? printed : 'function'
  }
  if (name && /^[A-Za-z_$][\w$]*$/.test(name) && !name.startsWith('__')) return name
  return 'object'
}

const nodeBuiltins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))
function stableParameterType(type: string): string {
  return type.replace(/import\("([^"]+)"\)/g, (original, moduleName: string) =>
    nodeBuiltins.has(moduleName) ? `import("node:${moduleName}")` : original)
}

function conciseParameterType(parameter: TS.ParameterDeclaration, node: FunctionNode, source: TS.SourceFile, checker: TS.TypeChecker): string {
  const type = checker.getTypeAtLocation(parameter)
  const printed = stableParameterType(checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation))
  if (printed.length <= 120 && !/import\(["'](?:\/|[A-Za-z]:[\\/])/.test(printed)) return printed
  if (parameter.type && ts.isTypeReferenceNode(parameter.type)) {
    const written = parameter.type.getText(source)
    if (written.length <= 120 && !/import\(|[{};\n]/.test(written)) return written
  }
  const summary = conciseType(type, node, checker)
  const args = type.aliasTypeArguments ?? (type.flags & ts.TypeFlags.Object &&
    (type as TS.ObjectType).objectFlags & ts.ObjectFlags.Reference
    ? checker.getTypeArguments(type as TS.TypeReference) : [])
  if (args.length && args.length <= 3 && summary !== 'object' && /^[A-Za-z_$][\w$]*$/.test(summary)) {
    const generic = `${summary}<${args.map((arg) => conciseType(arg, node, checker)).join(', ')}>`
    if (generic.length <= 120) return generic
  }
  return summary
}

const config = ts.readConfigFile(join(projectRoot, 'tsconfig.json'), ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, projectRoot)
if (parsed.errors.length) throw new Error('Cannot parse the app tsconfig.json')
// Explicitly include tests and config even when the build tsconfig excludes them.
const files = sourceFiles()
const program = ts.createProgram(files, { ...parsed.options, allowJs: true, noEmit: true })
const checker = program.getTypeChecker()
const previous = mode === '--probe' || force ? [] : readCatalog()
const identity = (entry: Pick<FunctionRecord, 'location' | 'name' | 'context'>) =>
  JSON.stringify([entry.location, entry.name, entry.context ?? ''])
// Cross-scope IDs must include the owning project path. Catalog locations remain
// scope-relative for navigation, while the readable ID uses the project-relative path.
const projectLocation = (location: string) => scoped && !rootOnly
  ? `${ownedPath.split(sep).join('/')}/${location}` : location
const lexicalSegment = (text: string) => text.normalize('NFKC').replace(/[^A-Za-z0-9_$.-]+/g, '-')
  .replace(/^[.-]+|[.-]+$/g, '') || 'anonymous'
// A readable project-relative path plus lexical owner chain; sanitization collisions
// are disambiguated in a second pass rather than silently sharing an ID.
const lexicalId = (entry: Pick<FunctionRecord, 'location' | 'name' | 'context'>) => {
  const owner = (entry.context ?? '').split(' > ').filter(Boolean).map(lexicalSegment)
  if (entry.name) owner.push(lexicalSegment(entry.name))
  return `fn:${projectLocation(entry.location)}#${owner.join('.') || 'anonymous'}`
}
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
  return '# Readable lexical IDs; range suffixes may change. Review links before any refresh.\n' + body
}

// Count readable candidate IDs so *all* members of a collision group receive
// a range suffix, including contexts that normalize to the same lexical path.
const baseCounts = new Map<string, number>()
{
  for (const file of files) {
    const source = program.getSourceFile(file)
    if (!source) continue
    const location = relative(appRoot, file)
    const visit = (node: TS.Node): void => {
      if (isFunction(node)) {
        const key = lexicalId({ location, name: declaredName(node), context: contextFor(node, source) })
        baseCounts.set(key, (baseCounts.get(key) ?? 0) + 1)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}
const seen = new Set<string>()
const used = new Set<string>()
const records: FunctionRecord[] = []
type IdentityIssue = { kind: 'collision' | 'invalid-record' | 'missing-source'; location: string; message: string }
const identityIssues: IdentityIssue[] = []
let signatureOnly = 0
let definitions = 0
let added = 0
for (const file of files) {
  const source = program.getSourceFile(file)
  if (!source) {
    const location = relative(appRoot, file)
    identityIssues.push({ kind: 'missing-source', location, message: `Cannot parse owned source ${location}` })
    continue
  }
  function visit(node: TS.Node): void {
    if (isSignatureOnly(node)) signatureOnly++
    if (isFunction(node)) {
      definitions++
      const name = declaredName(node)
      const context = contextFor(node, source!)
      const location = relative(appRoot, file)
      const baseKey = lexicalId({ location, name, context })
      const offsetFallback = (baseCounts.get(baseKey) ?? 0) > 1 || (!name && !context)
      const start = node.getStart(source)
      const end = node.getEnd()
      const breadcrumb = offsetFallback
        ? `${context ? `${context} > ` : ''}@utf16:${start}-${end}:${ts.SyntaxKind[node.kind]}` : context
      const key = identity({ location, name, context: breadcrumb })
      const id = offsetFallback
        ? `${baseKey}@utf16:${start}-${end}:${ts.SyntaxKind[node.kind]}` : baseKey
      if (seen.has(key)) {
        identityIssues.push({ kind: 'collision', location, message: `Ambiguous function identity ${key}; review the source` })
      } else {
        seen.add(key)
        const old = byIdentity.get(key)
        if (old && old.id !== id) {
          throw new Error(`Identity changed for ${location} (${name ?? breadcrumb}): ${old.id} -> ${id}. Review authored links before replacing the catalog.`)
        }
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
            type: conciseParameterType(parameter, node, source!, checker),
            ...(oldParameter?.description ? { description: oldParameter.description } : {}),
            ...(oldParameter?.default ? { default: oldParameter.default } : {}),
            required: !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken,
          }
        })
        const record: FunctionRecord = {
          id,
          name,
          ...(old?.description ? { description: old.description } : {}),
          location,
          sourceScope: old?.sourceScope ?? sourceScopeFor(location),
          ...(breadcrumb ? { context: breadcrumb } : {}),
          parameters,
          return: {
            type: returnType,
            ...(old?.return.description ? { description: old.return.description } : {}),
          },
        }
        if (!validate(record)) identityIssues.push({ kind: 'invalid-record', location, message: `Generated invalid function at ${location}: ${JSON.stringify(validate.errors)}` })
        else records.push(record)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

const missing = previous.filter((entry) => !used.has(entry.id))
function reportAmbiguities(limit = Infinity): void {
  const unresolved = records.filter((entry) => entry.sourceScope === 'unclassified')
  if (!unresolved.length) return
  console.warn(`${unresolved.length} function source scope(s) need review:`)
  for (const entry of unresolved.slice(0, limit)) {
    console.warn(`- ${entry.id}: ${entry.location} — ${entry.name ?? entry.context ?? 'anonymous function'}`)
  }
  if (unresolved.length > limit) console.warn(`... and ${unresolved.length - limit} more; review the scope before writing.`)
}
if (mode === '--probe') {
  const byDirectory = new Map<string, number>()
  for (const file of files) {
    const path = relative(appRoot, file)
    const directory = path.includes(sep) ? path.split(sep)[0] : '(root)'
    byDirectory.set(directory, (byDirectory.get(directory) ?? 0) + 1)
  }
  console.log(`Probe: ${definitions} definitions in ${files.length} source files; ${records.length} provisionally recordable; ${identityIssues.length} identity issue(s).`)
  console.log(`Excluded ${signatureOnly} signature-only declaration(s) without bodies (not implementations).`)
  console.log(`Scope: ${appRoot}; TypeScript: ${usingProjectTypescript ? 'project installation' : 'CLI fallback (types may differ)'}.`)
  console.log(`Files by top-level directory: ${[...byDirectory].map(([name, count]) => `${name}=${count}`).join(', ')}`)
  console.log(`Skipped generated/local directories (${skippedDirectories.length}): ${skippedDirectories.slice(0, 20).join(', ') || 'none'}${skippedDirectories.length > 20 ? ', ...' : ''}.`)
  const issueKinds = new Map<string, number>()
  const issueDirectories = new Map<string, number>()
  for (const issue of identityIssues) {
    issueKinds.set(issue.kind, (issueKinds.get(issue.kind) ?? 0) + 1)
    const directory = issue.location.includes(sep) ? issue.location.split(sep)[0] : '(root)'
    issueDirectories.set(directory, (issueDirectories.get(directory) ?? 0) + 1)
  }
  console.log(`Identity issues by cause: ${[...issueKinds].map(([name, count]) => `${name}=${count}`).join(', ') || 'none'}.`)
  const busiest = [...issueDirectories].sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log(`Identity issues by directory: ${busiest.map(([name, count]) => `${name}=${count}`).join(', ') || 'none'}.`)
  for (const issue of identityIssues.slice(0, 20)) console.error(`- ${issue.message}`)
  for (const [directory] of busiest.slice(0, 5)) {
    const samples = identityIssues.filter((issue) =>
      (issue.location.includes(sep) ? issue.location.split(sep)[0] : '(root)') === directory)
    for (const message of [...new Set(samples.map((issue) => issue.message))].slice(0, 2)) {
      console.error(`Sample from ${directory}: ${message}`)
    }
  }
  if (identityIssues.length > 20) console.error(`... and ${identityIssues.length - 20} more identity issues.`)
  reportAmbiguities(20)
  if (identityIssues.length) process.exitCode = 1
} else if (identityIssues.length) {
  throw new Error(`${identityIssues.length} function identity issue(s); first: ${identityIssues.slice(0, 5).map((issue) => issue.message).join('; ')}. Run --probe to inspect all before writing.`)
} else if (missing.length) {
  throw new Error(`Unmatched prior IDs: ${missing.map((entry) => entry.id).join(', ')}. Review moves/removals and links; normal writes never prune automatically.`)
} else {
  if (new Set(records.map((entry) => entry.id)).size !== records.length) {
    throw new Error('Generated duplicate function IDs')
  }
  if (mode === '--check') {
    const text = existsSync(catalogFile) ? readFileSync(catalogFile, 'utf8') : ''
    const matches = existsSync(catalogFile) && isDeepStrictEqual(previous, records) &&
      hasSeparatedEntries(text, records.length)
    if (!matches) {
      console.error(`Function catalog is stale or lacks a blank line between entries (${added} new definitions). Refresh with --write and review the diff.`)
      process.exitCode = 1
    } else {
      console.log(`Function catalog matches ${records.length} definitions in ${files.length} owned files.`)
    }
  } else {
    if (force && existsSync(catalogFile)) {
      console.warn(`Replacing ${catalogFile} from source; previous IDs and curated metadata will be lost. Review authored links separately.`)
    }
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
}
