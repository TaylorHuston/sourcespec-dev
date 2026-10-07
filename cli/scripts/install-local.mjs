import { execFileSync } from 'node:child_process'
import { constants, copyFileSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const destination = join(homedir(), '.sourcespec')
const marker = join(destination, '.cli-install.json')
const executable = join(destination, 'bin/sourcespec')
const schemaDir = join(destination, 'schema')
const schemas = ['data-models', 'functions', 'operations', 'requirements', 'tests'].map((name) => ({
  source: join(cliRoot, '../schema', `${name}.yaml`),
  target: join(schemaDir, `${name}.yaml`),
}))
const linkTarget = '../node_modules/.bin/sourcespec'
const stat = (path) => lstatSync(path, { throwIfNoEntry: false })
const existing = stat(destination)
if (existing) {
  if (!existing.isDirectory() || existing.isSymbolicLink()) {
    throw new Error(`Refusing to install through a non-directory or symlink: ${destination}`)
  }
  const markerFile = stat(marker)
  if (!markerFile?.isFile() || markerFile.isSymbolicLink() ||
      JSON.parse(readFileSync(marker, 'utf8')).package !== '@sourcespec/cli') {
    throw new Error(`${destination} is not a recognized SourceSpec CLI installation; refusing to modify it`)
  }
}
for (const directory of [join(destination, 'bin'), join(destination, 'node_modules'), schemaDir]) {
  const entry = stat(directory)
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error(`Refusing to install through a non-directory or symlink: ${directory}`)
  }
}
for (const { source, target } of schemas) {
  const entry = stat(target)
  if (entry && (!entry.isFile() || entry.isSymbolicLink() ||
      readFileSync(target, 'utf8') !== readFileSync(source, 'utf8'))) {
    throw new Error(`Installed schema differs at ${target}; review it before refreshing the CLI. Installation never overwrites schemas.`)
  }
}
const installedBin = stat(executable)
if (installedBin && (!installedBin.isSymbolicLink() || readlinkSync(executable) !== linkTarget)) {
  throw new Error(`Refusing to replace the existing executable at ${executable}`)
}

const staging = mkdtempSync(join(tmpdir(), 'sourcespec-cli-install-'))
try {
  execFileSync('pnpm', ['--dir', cliRoot, 'build'], { stdio: 'inherit' })
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', staging],
    { cwd: cliRoot, encoding: 'utf8' }))
  execFileSync('npm', ['install', '--prefix', destination, '--no-audit', '--no-fund', join(staging, packed.filename)],
    { stdio: 'inherit' })
  mkdirSync(join(destination, 'bin'), { recursive: true })
  if (!installedBin) symlinkSync(linkTarget, executable)
  mkdirSync(schemaDir, { recursive: true })
  for (const { source, target } of schemas) {
    if (!stat(target)) copyFileSync(source, target, constants.COPYFILE_EXCL)
  }
  writeFileSync(marker, JSON.stringify({ package: '@sourcespec/cli', version: packed.version }) + '\n')
  console.log(`Installed SourceSpec CLI ${packed.version} at ${executable}`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
