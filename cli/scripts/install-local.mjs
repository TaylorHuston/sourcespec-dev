import { execFileSync } from 'node:child_process'
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const destination = join(homedir(), '.sourcespec')
const marker = join(destination, '.cli-install.json')
const executable = join(destination, 'bin/sourcespec')
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
for (const directory of [join(destination, 'bin'), join(destination, 'node_modules')]) {
  const entry = stat(directory)
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error(`Refusing to install through a non-directory or symlink: ${directory}`)
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
  writeFileSync(marker, JSON.stringify({ package: '@sourcespec/cli', version: packed.version }) + '\n')
  console.log(`Installed SourceSpec CLI ${packed.version} at ${executable}`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
