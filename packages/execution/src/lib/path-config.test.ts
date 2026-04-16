import { describe, it, expect } from 'vitest'
import path from 'path'
import { createPathConfig } from './path-config.js'

describe('createPathConfig', () => {
  it('sets testsDir to the provided root', () => {
    const config = createPathConfig('/my/root')
    expect(config.testsDir).toBe('/my/root')
  })

  it('sets harnessDir to packages under root', () => {
    const config = createPathConfig('/my/root')
    expect(config.harnessDir).toBe(path.join('/my/root', 'packages'))
  })

  it('sets repoRoot to parent of root', () => {
    const config = createPathConfig('/my/root')
    expect(config.repoRoot).toBe(path.join('/my/root', '..'))
  })

  it('sets outputDir to output under root', () => {
    const config = createPathConfig('/my/root')
    expect(config.outputDir).toBe(path.join('/my/root', 'output'))
  })

  it('sets dataDir to analytics under root', () => {
    const config = createPathConfig('/my/root')
    expect(config.dataDir).toBe(path.join('/my/root', 'analytics'))
  })

  it('produces correct paths for a different root directory', () => {
    const config = createPathConfig('/other/dir')
    expect(config.testsDir).toBe('/other/dir')
    expect(config.outputDir).toBe(path.join('/other/dir', 'output'))
    expect(config.dataDir).toBe(path.join('/other/dir', 'analytics'))
  })
})
