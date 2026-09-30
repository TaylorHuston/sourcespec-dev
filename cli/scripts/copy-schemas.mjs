import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const assets = join(here, '../assets')
mkdirSync(assets, { recursive: true })
for (const name of ['functions', 'tests']) {
  copyFileSync(join(here, `../../schema/${name}.yaml`), join(assets, `${name}.schema.yaml`))
}
