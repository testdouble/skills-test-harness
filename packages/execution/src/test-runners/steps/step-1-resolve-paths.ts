import path from 'node:path'

export function resolvePaths(evalName: string, testsDir: string): { evalDir: string } {
  const evalDir = path.join(testsDir, 'evals', evalName)
  return { evalDir }
}
