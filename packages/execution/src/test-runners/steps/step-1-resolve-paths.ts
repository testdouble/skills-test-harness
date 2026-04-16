import path from 'node:path'

export function resolvePaths(suite: string, testsDir: string): { testSuiteDir: string } {
  const testSuiteDir = path.join(testsDir, 'test-suites', suite)
  return { testSuiteDir }
}
