import path from 'node:path'

export interface PathConfig {
  testsDir: string
  harnessDir: string
  outputDir: string
  dataDir: string
}

export function createPathConfig(rootDir: string): PathConfig {
  const testsDir = rootDir
  const harnessDir = path.join(testsDir, 'packages')
  return {
    testsDir,
    harnessDir,
    outputDir: path.join(testsDir, 'output'),
    dataDir: path.join(testsDir, 'analytics'),
  }
}
