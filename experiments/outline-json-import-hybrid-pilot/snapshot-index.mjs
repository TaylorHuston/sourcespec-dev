// Experiment-only, revision-scoped callable index. Not a CPG or a SourceSpec catalog.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const requireCli = createRequire(new URL('../../cli/package.json', import.meta.url))
const ts = requireCli('typescript')
const ignored = new Set(['.git', '.sourcespec', '.data', '.next', '.turbo', 'node_modules', 'dist', 'build', 'coverage', 'storybook-static', 'test-results', 'playwright-report'])
const slash = (path) => path.split(sep).join('/')

function sourcePaths(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : sourcePaths(path)
    if (!entry.isFile() || /\.d\.[cm]?ts$/.test(entry.name)) return []
    return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) ? [path] : []
  }).sort()
}

function signatureOnly(node) {
  return (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)) && !node.body
}

function callable(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) ||
    ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) && !!node.body)
}

/** Addresses are exact only for these file contents and this parser version. Offsets are UTF-16 code units. */
export function buildSnapshot(project, scope) {
  if (!['server', 'app'].includes(scope)) throw new Error('Expected --scope server or app')
  const scopeRoot = realpathSync(join(project, scope))
  const files = sourcePaths(scopeRoot)
  const hash = createHash('sha256').update(`typescript:${ts.version}\0scope:${scope}\0`)
  const parsed = []
  for (const path of files) {
    const file = slash(relative(scopeRoot, path))
    const text = readFileSync(path, 'utf8')
    hash.update(`${file.length}:${file}\0${Buffer.byteLength(text)}:`).update(text).update('\0')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    if (source.parseDiagnostics.length) {
      throw new Error(`Cannot index ${scope}/${file}: ${source.parseDiagnostics.length} parse diagnostic(s)`)
    }
    parsed.push({ file, source })
  }
  const snapshot = hash.digest('hex')
  const entries = []
  let skippedSignatures = 0
  for (const { file, source } of parsed) {
    const visit = (node) => {
      if (signatureOnly(node)) skippedSignatures++
      if (callable(node)) {
        const start = node.getStart(source)
        const end = node.getEnd()
        const { line, character } = source.getLineAndCharacterOfPosition(start)
        const record = {
          id: `${snapshot}:${scope}/${file}:${start}-${end}:${ts.SyntaxKind[node.kind]}`,
          scope,
          file,
          kind: ts.SyntaxKind[node.kind],
          name: ts.isConstructorDeclaration(node) ? 'constructor' : node.name?.getText(source) ?? null,
          // Source positions, not durable IDs, are useful for opening a result in an editor.
          startUtf16: start,
          endUtf16: end,
          line: line + 1,
          column: character + 1,
        }
        entries.push({ record, node, source })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const ids = entries.map(({ record }) => record.id)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate snapshot-scoped callable address')
  return { snapshot, scope, files: files.length, skippedSignatures, entries }
}

/** These selectors assert source syntax, not whether or when a callback executes. */
export function resolveAnchors(index, anchors) {
  if (!Array.isArray(anchors)) throw new Error('Expected an array of anchors')
  const ids = new Set()
  for (const anchor of anchors) {
    if (!anchor || typeof anchor.id !== 'string' || !anchor.id ||
        !['server', 'app'].includes(anchor.scope) || typeof anchor.file !== 'string' ||
        !anchor.selector || typeof anchor.selector.kind !== 'string') {
      throw new Error(`Invalid anchor or unknown scope: ${JSON.stringify(anchor)}`)
    }
    if (ids.has(anchor.id)) throw new Error(`Duplicate anchor ID: ${anchor.id}`)
    ids.add(anchor.id)
  }
  return anchors.filter((anchor) => anchor.scope === index.scope).map((anchor) => {
    const matches = index.entries.filter(({ record, node, source }) => {
      if (record.file !== anchor.file) return false
      const { selector } = anchor
      if (selector.kind === 'method') {
        return ts.isMethodDeclaration(node) && node.name.getText(source) === selector.member &&
          (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) &&
          node.parent.name?.text === selector.class
      }
      if (selector.kind === 'route-callback') {
        const call = node.parent
        return (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
          ts.isCallExpression(call) && call.arguments.at(-1) === node &&
          call.expression.getText(source) === `router.${selector.method}` &&
          ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === selector.operation
      }
      if (selector.kind === 'bound-call-argument') {
        const call = node.parent
        return (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
          ts.isCallExpression(call) && call.arguments[selector.argument] === node &&
          call.expression.getText(source) === selector.callee &&
          ts.isVariableDeclaration(call.parent) && call.parent.name.getText(source) === selector.variable
      }
      throw new Error(`Unsupported selector kind: ${selector.kind}`)
    })
    return {
      id: anchor.id,
      status: matches.length === 1 ? 'unique' : matches.length ? 'ambiguous' : 'missing',
      matches: matches.map(({ record }) => record.id),
      locations: matches.map(({ record }) => `${record.file}:${record.line}:${record.column}`),
    }
  })
}

function runCli(args) {
  const options = Object.fromEntries(args.reduce((pairs, flag, index) => {
    if (index % 2 === 0) pairs.push([flag, args[index + 1]])
    return pairs
  }, []))
  if (args.length % 2 || !isAbsolute(options['--project'] ?? '') ||
      !['server', 'app'].includes(options['--scope']) ||
      !isAbsolute(options['--anchors'] ?? '') ||
      (options['--output'] && !isAbsolute(options['--output'])) ||
      Object.keys(options).some((key) => !['--project', '--scope', '--anchors', '--output'].includes(key))) {
    throw new Error('Usage: node snapshot-index.mjs --project <absolute-outline-root> --scope server|app --anchors <absolute-anchors.json> [--output <absolute-json-path>]')
  }
  const index = buildSnapshot(options['--project'], options['--scope'])
  const anchors = JSON.parse(readFileSync(options['--anchors'], 'utf8'))
  const resolution = resolveAnchors(index, anchors)
  const result = {
    snapshot: index.snapshot,
    typescriptVersion: ts.version,
    scope: index.scope,
    files: index.files,
    definitions: index.entries.length,
    skippedSignatures: index.skippedSignatures,
    anchors: resolution,
  }
  if (options['--output']) {
    if (existsSync(options['--output'])) throw new Error('Output already exists; do not overwrite a previous snapshot')
    writeFileSync(options['--output'], JSON.stringify({ ...result, records: index.entries.map(({ record }) => record) }, null, 2), { flag: 'wx' })
  }
  console.log(JSON.stringify(result, null, 2))
  if (resolution.some((item) => item.status !== 'unique')) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2))
}
