import { describe, expect, it } from 'vitest'
import { skillwalkerVersion } from './version.js'

describe('skillwalkerVersion', () => {
  it('reports dev when running from source without a build-time version', () => {
    expect(skillwalkerVersion).toBe('dev')
  })
})
