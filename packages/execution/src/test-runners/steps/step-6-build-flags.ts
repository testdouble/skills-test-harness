import { resolvePluginDirs } from '@testdouble/claude-integration'
import type { EvalConfig } from '@testdouble/skillwalker-data'

export function buildFlags(config: EvalConfig, repoRoot: string): { pluginDirs: string[] } {
  const pluginDirs = resolvePluginDirs(config.plugins, repoRoot)
  return { pluginDirs }
}
