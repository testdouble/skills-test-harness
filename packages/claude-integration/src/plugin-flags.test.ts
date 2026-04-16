import { describe, it, expect } from 'vitest'
import { resolvePluginDirs } from './plugin-flags.js'

describe('resolvePluginDirs', () => {
  it('returns resolved paths for each plugin using repoRoot', () => {
    const result = resolvePluginDirs(['plugin-a', 'plugin-b'], '/repo')
    expect(result).toEqual(['/repo/plugin-a', '/repo/plugin-b'])
  })

  it('returns empty array for no plugins', () => {
    expect(resolvePluginDirs([], '/repo')).toEqual([])
  })

  it('uses the provided repoRoot for paths', () => {
    const result = resolvePluginDirs(['my-plugin'], '/some/other/path')
    expect(result).toEqual(['/some/other/path/my-plugin'])
  })
})
