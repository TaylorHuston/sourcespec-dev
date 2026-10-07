import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import YAML from 'yaml'
import type { SchemaObject } from 'ajv'

/** The installer owns the shared schemas next to the user-local CLI. */
export function readInstalledSchema(name: string): SchemaObject {
  const path = join(homedir(), '.sourcespec/schema', `${name}.yaml`)
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Reinstall the SourceSpec CLI to restore its schemas.`)
  }
  const schema: unknown = YAML.parse(readFileSync(path, 'utf8'))
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`Expected an object schema in ${path}`)
  }
  return schema as SchemaObject
}
