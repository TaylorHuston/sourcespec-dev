#!/usr/bin/env node

const [area, action, ...options] = process.argv.slice(2)
const forceCount = options.filter((option) => option === '--force').length
const valid = ((area === 'sspc-functions' && ['probe', 'write', 'check'].includes(action ?? '')) ||
  (area === 'sspc-tests' && ['write', 'check'].includes(action ?? ''))) &&
  (forceCount === 0 || (forceCount === 1 && action === 'write'))
if (!valid) {
  console.error('Usage: sourcespec sspc-functions probe|write|check --app <absolute-app-root> [--force for write]\n' +
    '       sourcespec sspc-functions probe|write|check --project <absolute-config-root> --scope <relative-owned-directory|@root> [--force for write]\n' +
    '       sourcespec sspc-tests write|check --app <absolute-app-root> [--force for write]')
  process.exitCode = 2
} else {
  // The adapters validate scope. Normalize --force so it is accepted anywhere after write.
  process.argv.splice(2, process.argv.length - 2, ...options.filter((option) => option !== '--force'),
    ...(forceCount ? ['--force'] : []), `--${action}`)
  try {
    if (area === 'sspc-functions') await import('./functions.js')
    else await import('./tests.js')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
