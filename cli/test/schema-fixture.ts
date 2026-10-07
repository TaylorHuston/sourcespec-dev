import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// CLI fixtures use a disposable home; tests never depend on or modify the operator's installation.
export const schemaHome = mkdtempSync(join(tmpdir(), 'sspc-schema-home-'))
const directory = join(schemaHome, '.sourcespec/schema')
mkdirSync(directory, { recursive: true })
for (const name of ['data-models', 'functions', 'operations', 'requirements', 'tests']) {
  copyFileSync(fileURLToPath(new URL(`../../schema/${name}.yaml`, import.meta.url)), join(directory, `${name}.yaml`))
}
export const schemaEnv = { ...process.env, HOME: schemaHome }
process.on('exit', () => rmSync(schemaHome, { recursive: true, force: true }))
