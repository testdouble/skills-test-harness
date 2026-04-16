import fs from 'node:fs'
import path from 'node:path'
import { createPathConfig } from '@testdouble/harness-execution'

const config = createPathConfig(process.cwd())

export const testsDir = config.testsDir
export const harnessDir = config.harnessDir
export const outputDir = config.outputDir
export const dataDir = config.dataDir

export function getTestSuiteDir(suite: string): string {
  return path.join(config.testsDir, 'test-suites', suite)
}

export function getAllTestSuites(): string[] {
  const testSuitesDir = path.join(config.testsDir, 'test-suites')
  return fs.readdirSync(testSuitesDir).filter((entry) => fs.statSync(path.join(testSuitesDir, entry)).isDirectory())
}
