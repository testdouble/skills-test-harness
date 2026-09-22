export type { AcilIterationResult, AcilQueryResult, AcilTestCase } from '@testdouble/skillwalker-data'

export interface AcilConfig {
  eval: string
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
