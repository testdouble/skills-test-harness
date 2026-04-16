import { describe, it, expect, vi } from 'vitest'
import { buildFlags } from './step-6-build-flags.js'
import { resolvePluginDirs } from '@testdouble/claude-integration'
import type { TestSuiteConfig } from '@testdouble/harness-data'

vi.mock('@testdouble/claude-integration', () => ({
  resolvePluginDirs: vi.fn(() => ['/mock/repo/r-and-d']),
}))

const mockConfig: TestSuiteConfig = {
  plugins: ['r-and-d'],
  tests: [],
}

describe('buildFlags', () => {
  it('calls resolvePluginDirs with config.plugins and repoRoot', () => {
    buildFlags(mockConfig, '/mock/repo')
    expect(vi.mocked(resolvePluginDirs)).toHaveBeenCalledWith(['r-and-d'], '/mock/repo')
  })

  it('returns pluginDirs from the resolver', () => {
    const result = buildFlags(mockConfig, '/mock/repo')
    expect(result.pluginDirs).toEqual(['/mock/repo/r-and-d'])
  })
})
