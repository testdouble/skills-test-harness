import path from 'node:path'

export function resolvePluginDirs(plugins: string[], repoRoot: string): string[] {
  return plugins.map((p) => path.join(repoRoot, p))
}
