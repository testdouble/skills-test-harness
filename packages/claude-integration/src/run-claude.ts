import type { ClaudeRunResult, ClaudeRunOptions } from './types.js'
import { execInSandbox } from '@testdouble/docker-integration'
import { resolveRelativePath } from '@testdouble/bun-helpers'

const sandboxRunScript = resolveRelativePath(
  import.meta,
  '../sandbox-run.sh',
  'packages/claude-integration/sandbox-run.sh'
)

export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const { model, prompt, pluginDirs = [], scaffold = null, debug = false } = options

  // Plugin dirs are passed as explicit args to sandbox-run.sh (not as --plugin-dir flags)
  // so that docker sandbox exec maps them into the container filesystem.
  // Format: <plugin_dir_count> <dir1> <dir2> ... <claude_args...>
  const pluginDirArgs = [String(pluginDirs.length), ...pluginDirs]

  const claudeArgs = [
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
    '--dangerously-skip-permissions',
    '--print', prompt,
  ]

  return execInSandbox(sandboxRunScript, [...pluginDirArgs, ...claudeArgs], scaffold, debug)
}
