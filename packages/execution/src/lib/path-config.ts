import path from 'node:path'

export interface PathConfig {
  testsDir: string
  skillwalkerDir: string
  outputDir: string
  dataDir: string
}

export function createPathConfig(rootDir: string): PathConfig {
  const testsDir = rootDir
  const skillwalkerDir = path.join(testsDir, 'packages')
  return {
    testsDir,
    skillwalkerDir,
    outputDir: path.join(testsDir, 'output'),
    dataDir: path.join(testsDir, 'analytics'),
  }
}
