import fs from 'node:fs'
import path from 'node:path'
import { resolveRelativePath } from '@testdouble/bun-helpers'

export interface SandboxScripts {
  runScript: string
  extractScript: string
  /**
   * Directory holding the scripts `sbx exec` runs by their host path. The sandbox
   * only sees host paths under a mounted workspace, so this directory must be
   * mounted alongside the target repo.
   */
  scriptsDir: string
}

function overrideScript(dir: string, name: string): string {
  const script = path.join(dir, name)
  if (!fs.existsSync(script)) {
    throw new Error(`SKILLWALKER_SCRIPTS_DIR is set to ${dir}, but it has no ${name}`)
  }
  return script
}

export function resolveSandboxScripts(env: NodeJS.ProcessEnv): SandboxScripts {
  if (env.SKILLWALKER_SCRIPTS_DIR) {
    const overrideDir = path.resolve(env.SKILLWALKER_SCRIPTS_DIR)
    return {
      runScript: overrideScript(overrideDir, 'sandbox-run.sh'),
      extractScript: overrideScript(overrideDir, 'sandbox-extract.sh'),
      scriptsDir: overrideDir,
    }
  }

  const runScript = resolveRelativePath(import.meta, '../sandbox-run.sh', 'sandbox-run.sh')
  const extractScript = resolveRelativePath(import.meta, '../sandbox-extract.sh', 'sandbox-extract.sh')
  return { runScript, extractScript, scriptsDir: path.dirname(runScript) }
}

const scripts = resolveSandboxScripts(process.env)

export const sandboxRunScript = scripts.runScript
export const sandboxExtractScript = scripts.extractScript
export const sandboxScriptsDir = scripts.scriptsDir
