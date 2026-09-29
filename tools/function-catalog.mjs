import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

// This tool lives outside the example app so its own functions do not enter that app's inventory.
const appRoot = process.cwd()
const requireFromApp = createRequire(join(appRoot, 'package.json'))
const ts = requireFromApp('typescript')
const YAML = requireFromApp('yaml')
const catalogFile = join(appRoot, '.sourcespec/catalogs/functions-catalog.yaml')
const mode = process.argv[2]
const prune = mode === '--write' && process.argv[3] === '--prune'
if (!['--check', '--write'].includes(mode) || process.argv.length > (prune ? 4 : 3)) {
  throw new Error('Use --check, --write, or --write --prune from an example app root')
}

function sourceFiles(directory = appRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.data', '.sourcespec', '.git'].includes(entry.name)) return []
      return sourceFiles(join(directory, entry.name))
    }
    return entry.isFile() && /\.(?:[cm]?js|jsx|tsx?)$/.test(entry.name) ? [join(directory, entry.name)] : []
  }).sort()
}

function isFunction(node) {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
}

function declaredName(node) {
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  if (ts.isArrowFunction(node)) return null
  return node.name?.getText() ?? null
}

function expressionLabel(node, source) {
  if (ts.isPropertyAccessExpression(node)) return `${expressionLabel(node.expression, source)}.${node.name.text}`
  if (ts.isCallExpression(node)) {
    // Include identifier arguments (e.g. functionsFile vs testsFile) but not callback bodies.
    const argumentsHint = node.arguments.filter((argument) => !isFunction(argument))
      .map((argument) => ts.isStringLiteral(argument) ? argument.text : expressionLabel(argument, source)).join(', ')
    return `${expressionLabel(node.expression, source)}(${argumentsHint})`
  }
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
    return expressionLabel(node.expression, source)
  }
  return node.getText(source).replace(/\s+/g, ' ').slice(0, 100)
}

function contextFor(node, source) {
  const labels = []
  let child = node
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(child)) {
      const literal = parent.arguments.find((argument) => ts.isStringLiteral(argument))
      const bodyCall = ts.isNewExpression(parent) && ts.isCallExpression(node.body)
        ? ` > invokes ${expressionLabel(node.body.expression, source)}` : ''
      const dependencies = ts.isCallExpression(parent) && expressionLabel(parent.expression, source) === 'useEffect'
        ? ` dependencies ${parent.arguments[1]?.getText(source) ?? 'unknown'}` : ''
      labels.push(`${ts.isNewExpression(parent) ? 'new ' : ''}${expressionLabel(parent.expression, source)}${literal ? `(${literal.text})` : ''}${dependencies}${bodyCall}`)
    } else if (ts.isJsxAttribute(parent) && parent.initializer === child) {
      const element = parent.parent?.parent
      const id = (ts.isJsxSelfClosingElement(element) || ts.isJsxOpeningElement(element))
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
      labels.push(declaredName(parent))
    } else if (ts.isClassDeclaration(parent) && parent.name) {
      labels.push(parent.name.text)
    }
  }
  return labels.reverse().join(' > ')
}

// Summarize the actual call return type without persisting TypeScript's expanded,
// machine-specific inferred object shapes. Keep promises, arrays, unions and named types.
function conciseType(type, node, checker) {
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
    const [element] = checker.getTypeArguments(type)
    return `${element ? conciseType(element, node, checker) : 'unknown'}[]`
  }
  const symbolName = type.aliasSymbol?.name ?? type.symbol?.name
  const argumentsOfType = type.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(type) : []
  if (symbolName === 'Promise') return `Promise<${argumentsOfType[0] ? conciseType(argumentsOfType[0], node, checker) : 'unknown'}>`
  if (symbolName === 'Element' && checker.typeToString(type, node).includes('JSX.Element')) return 'React.JSX.Element'
  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length) {
    const printed = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
    return printed.length <= 120 && !/import\(|[{}]/.test(printed) ? printed : 'function'
  }
  if (symbolName && /^[A-Za-z_$][\w$]*$/.test(symbolName) && !symbolName.startsWith('__')) {
    return symbolName
  }
  return 'object'
}

// This adapter classifies source ownership, not whether a callable is itself a test.
// Ambiguous paths stay visible for review instead of silently becoming application code.
function sourceScopeFor(location) {
  if (/(?:^|\/)(?:__tests__|tests?)\//.test(location) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(location)) return 'test'
  if (/(?:^|\/)(?:scripts|tools)\//.test(location) || /(?:^|\/)[^/]+\.config\.[cm]?[jt]sx?$/.test(location)) return 'tooling'
  if (/^(?:src|server|app|lib)\//.test(location)) return 'application'
  return 'unclassified'
}

function legacyLocation(node, file, source) {
  if (declaredName(node)) {
    const names = []
    for (let current = node; current; current = current.parent) {
      if (ts.isClassDeclaration(current) && current.name) names.push(current.name.text)
      else if (isFunction(current) && declaredName(current)) names.push(declaredName(current))
    }
    return `${file}#${names.reverse().join('.')}`
  }
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
  return `${file}:${line + 1}:${character + 1}`
}

const config = ts.readConfigFile(join(appRoot, 'tsconfig.json'), ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, appRoot)
if (parsed.errors.length) throw new Error('Cannot read the application tsconfig')
const files = sourceFiles()
const program = ts.createProgram(files, { ...parsed.options, allowJs: true, noEmit: true })
const checker = program.getTypeChecker()
const previous = existsSync(catalogFile) ? YAML.parse(readFileSync(catalogFile, 'utf8')).functions : []
const legacyBySource = new Map(previous.filter((item) => item.source)
  .map((item) => [`${item.source.file}:${item.source.start}`, item]))
const byIdentity = new Map()
for (const item of previous.filter((entry) => !entry.source)) {
  const key = JSON.stringify([item.location, item.name, item.context ?? ''])
  if (byIdentity.has(key)) throw new Error(`Ambiguous catalog identity for ${key}; reconcile the records before refreshing`)
  byIdentity.set(key, item)
}
const records = []
const identities = new Set()
const usedIds = new Set()
const flags = ts.TypeFormatFlags.NoTruncation

for (const absoluteFile of files) {
  const source = program.getSourceFile(absoluteFile)
  if (!source) throw new Error(`Could not parse ${absoluteFile}`)
  const file = relative(appRoot, absoluteFile)
  function visit(node) {
    if (isFunction(node)) {
      const name = declaredName(node)
      const context = contextFor(node, source)
      const key = JSON.stringify([file, name, context])
      if (identities.has(key)) throw new Error(`Ambiguous functions at ${file} (${name ?? 'anonymous'}, ${context}); review their call sites`)
      identities.add(key)
      if (!name && !context) throw new Error(`Anonymous function in ${file} has no searchable context`)
      const legacy = legacyBySource.get(`${file}:${node.getStart(source)}`)
      // Only trust the old offset when the old displayed location also agrees. This is migration-only.
      const old = legacy && legacy.name === name && legacy.location === legacyLocation(node, file, source)
        ? legacy : byIdentity.get(key)
      if (old && usedIds.has(old.id)) throw new Error(`Multiple functions matched catalog ID ${old.id}`)
      const id = old?.id ?? `fn-${randomUUID()}`
      usedIds.add(id)
      const signature = checker.getSignatureFromDeclaration(node)
      const inferredReturn = signature ? conciseType(checker.getReturnTypeOfSignature(signature), node, checker) : 'unknown'
      const curatedReturn = old?.description && old.return?.type && !/import\(|[{};\n]/.test(old.return.type)
        ? old.return.type : undefined
      const parameters = node.parameters.map((parameter) => {
        const parameterName = parameter.name.getText(source)
        const previousParameter = old?.parameters?.find((item) => item.name === parameterName)
        return {
          name: parameterName,
          type: checker.typeToString(checker.getTypeAtLocation(parameter), node, flags),
          ...(previousParameter?.description ? { description: previousParameter.description } : {}),
          ...(previousParameter?.default ? { default: previousParameter.default } : {}),
          required: !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken,
        }
      })
      records.push({
        id,
        name,
        ...(old?.description ? { description: old.description } : {}),
        location: file,
        sourceScope: old?.sourceScope ?? sourceScopeFor(file),
        ...(context ? { context } : {}),
        parameters,
        return: {
          type: curatedReturn ?? inferredReturn,
          ...(old?.return?.description ? { description: old.return.description } : {}),
        },
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

function hasSeparatedEntries(text, count) {
  const lines = text.split(/\r?\n/)
  const starts = lines.flatMap((line, index) => line.startsWith('  - id:') ? [index] : [])
  return starts.length === count && starts.every((index, position) => position === 0 ||
    (lines[index - 1] === '' && lines[index - 2] !== ''))
}

const missing = previous.filter((entry) => !usedIds.has(entry.id))
if (missing.length && mode === '--write' && !prune) {
  throw new Error(`Unmatched existing function IDs: ${missing.map((entry) => entry.id).join(', ')}. Reconcile moved functions, or use --write --prune after reviewing removed IDs and behavior links.`)
}
if (missing.length && prune) {
  const behaviorDir = join(appRoot, '.sourcespec/behaviors')
  const linked = existsSync(behaviorDir) ? readdirSync(behaviorDir).filter((file) => file.endsWith('.yaml'))
    .flatMap((file) => (YAML.parse(readFileSync(join(behaviorDir, file), 'utf8')).cases ?? [])
      .flatMap((entry) => (entry.implementedBy ?? []).map((link) => link.function))) : []
  const stillLinked = missing.filter((item) => linked.includes(item.id))
  if (stillLinked.length) throw new Error(`Cannot retire behavior-linked function IDs: ${stillLinked.map((item) => item.id).join(', ')}`)
}
if (mode === '--check') {
  if (!isDeepStrictEqual(previous, records) || !existsSync(catalogFile) ||
      !hasSeparatedEntries(readFileSync(catalogFile, 'utf8'), records.length)) {
    console.error('Function catalog differs from the app-owned inventory or lacks a blank line between entries. Run npm run catalog:refresh and review the diff.')
    process.exitCode = 1
  } else {
    console.log(`Function catalog covers all ${records.length} app-owned function definitions in ${files.length} source files.`)
  }
} else {
  const header = '# Generated function inventory. IDs and prose are preserved when identities match.\n' +
    '# Includes app-owned runtime, config, and test functions (including anonymous callbacks).\n' +
    '# Location is a file path; context is a search hint, not a guaranteed identity across refactors.\n'
  let firstRecord = true
  const body = YAML.stringify({ functions: records }, { lineWidth: 110 }).replace(/^  - id:/gm, (line) => {
    if (firstRecord) {
      firstRecord = false
      return line
    }
    return `\n${line}`
  })
  writeFileSync(catalogFile, header + body)
  if (missing.length) console.log(`Retired unmatched IDs: ${missing.map((entry) => entry.id).join(', ')}`)
  console.log(`Wrote ${records.length} function records to ${relative(appRoot, catalogFile)}.`)
}
