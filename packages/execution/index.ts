// High-level orchestrators

// ACIL
export { runAcilLoop } from './src/acil/loop.js'
export type { AcilConfig } from './src/acil/types.js'
// Errors (needed by CLI for top-level catch)
export { ConfigNotFoundError, HarnessError, RunNotFoundError } from './src/lib/errors.js'
export type { PathConfig } from './src/lib/path-config.js'
// Path config (needed by CLI to construct paths from process.cwd())
export { createPathConfig } from './src/lib/path-config.js'
// Re-eval marker (needed by update-analytics command)
export { clearReEvaluatedRuns, getReEvaluatedRuns, markAsReEvaluated } from './src/re-eval-marker.js'
// SCIL
export { runScilLoop } from './src/scil/loop.js'
export type { ScilConfig } from './src/scil/types.js'
export type { RunTestEvalOptions } from './src/test-eval/run-test-eval.js'
export { runTestEval } from './src/test-eval/run-test-eval.js'
// Exit helper (used by CLI commands)
export { exitWithResult } from './src/test-runners/steps/step-10-exit.js'
export type { RunTestSuiteOptions, RunTestSuiteResult } from './src/test-suite/run-test-suite.js'
export { runTestSuite } from './src/test-suite/run-test-suite.js'
