export type { IterationResult, QueryResult, ScilTestCase } from '@testdouble/skillwalker-data'

export interface ScilConfig {
  eval: string
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
