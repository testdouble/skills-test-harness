export type { AcilIterationResult, AcilQueryResult, AcilTestCase } from '@testdouble/harness-data'

export interface AcilConfig {
  suite: string
  agent?: string
  maxIterations: number
  holdout: number
  concurrency: number
  runsPerQuery: number
  model: string
  debug: boolean
  apply: boolean
  outputDir: string
  testsDir: string
  repoRoot: string
}
