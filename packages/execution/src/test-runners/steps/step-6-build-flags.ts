import { resolvePluginDirs } from '@testdouble/claude-integration'
import type { TestSuiteConfig } from '@testdouble/harness-data'

export function buildFlags(config: TestSuiteConfig, repoRoot: string): { pluginDirs: string[] } {
  const pluginDirs = resolvePluginDirs(config.plugins, repoRoot)
  return { pluginDirs }
}
