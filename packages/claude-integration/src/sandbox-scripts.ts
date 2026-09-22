import path from 'node:path'
import { resolveRelativePath } from '@testdouble/bun-helpers'

export const sandboxRunScript = resolveRelativePath(import.meta, '../sandbox-run.sh', 'sandbox-run.sh')
export const sandboxExtractScript = resolveRelativePath(import.meta, '../sandbox-extract.sh', 'sandbox-extract.sh')

/**
 * Directory holding the scripts `sbx exec` runs by their host path. The sandbox
 * only sees host paths under a mounted workspace, so this directory must be
 * mounted alongside the target repo.
 */
export const sandboxScriptsDir = path.dirname(sandboxRunScript)
