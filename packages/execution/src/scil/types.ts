export type { IterationResult, QueryResult, ScilTestCase } from '@testdouble/harness-data'

export interface ScilConfig {
  suite: string
  skill?: string
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
