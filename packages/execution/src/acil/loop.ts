import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import type { AcilConfig, AcilIterationResult } from './types.js'
import { getPhase } from '@testdouble/harness-data'
import { resolveAndLoad } from './step-1-resolve-and-load.js'
import { splitSets } from './step-2-split-sets.js'
import { readAgent } from './step-3-read-agent.js'
import { buildIterationPlugin } from './step-4-build-temp-plugin.js'
import { runEval } from './step-5-run-eval.js'
import { scoreResults, selectBestIteration } from './step-6-score.js'
import { improveDescription } from './step-7-improve-description.js'
import { applyDescription } from './step-8-apply-description.js'
import { writeIterationOutput, writeSummaryOutput } from './step-9-write-output.js'
import { printIterationProgress, printFinalSummary } from './step-10-print-report.js'
import { ensureSandboxExists } from '@testdouble/docker-integration'
import { HarnessError } from '../lib/errors.js'
import { generateRunId } from '../test-runners/steps/step-4-generate-run-id.js'

export async function runAcilLoop(config: AcilConfig): Promise<void> {
  // Step 1: Resolve agent and load tests
  process.stderr.write(`Resolving agent and loading tests for suite "${config.suite}"...\n`)
  const { agentFile, agentMdPath, tests } = await resolveAndLoad(config.suite, config.agent, config.testsDir, config.repoRoot)
  process.stderr.write(`Loaded ${tests.length} agent-call test(s) for ${agentFile}\n`)

  // Step 2: Split train/test sets
  if (config.holdout > 0) {
    process.stderr.write(`Splitting into train/test sets (holdout: ${config.holdout})...\n`)
  } else {
    process.stderr.write(`Using all ${tests.length} tests for training (no holdout)\n`)
  }
  const splitTests = splitSets(config.suite, agentFile, tests, config.holdout)
  const trainTestNames = new Set(splitTests.filter(t => t.set === 'train').map(t => t.name))

  // Step 3: Read agent .md
  process.stderr.write(`Reading agent .md: ${agentMdPath}\n`)
  const agent = await readAgent(agentMdPath)
  let currentDescription = agent.description

  // Ensure sandbox exists
  process.stderr.write('Checking sandbox...\n')
  await ensureSandboxExists()

  // Generate run ID and output directory
  const runId  = generateRunId()
  const runDir = path.join(config.outputDir, runId)
  process.stderr.write(`Run ID: ${runId}\n\n`)

  const iterations: AcilIterationResult[] = []

  let hasReachedConverge = false

  for (let i = 1; i <= config.maxIterations; i++) {
    const phase = getPhase(i, config.maxIterations)
    if (phase === 'converge') hasReachedConverge = true

    // Step 4: Build temp plugin with current description
    process.stderr.write(`Iteration ${i}/${config.maxIterations} — building temp plugin...\n`)
    const { tempDir } = await buildIterationPlugin(agentFile, runDir, currentDescription, config.repoRoot, i)

    // Step 5: Run eval on all test cases
    process.stderr.write(`Iteration ${i}/${config.maxIterations} — running eval (${splitTests.length} tests, concurrency ${config.concurrency})...\n`)
    const allResults = await runEval({
      tempDir,
      testCases:    splitTests,
      suite:        config.suite,
      testsDir:     config.testsDir,
      concurrency:  config.concurrency,
      runsPerQuery: config.runsPerQuery,
      debug:        config.debug,
      testRunId:    runId,
      runDir,
    })

    // Split results back into train/test by set membership
    const trainResults = allResults.filter(r => trainTestNames.has(r.testName))
    const testResults  = allResults.filter(r => !trainTestNames.has(r.testName))

    // Step 6: Score
    const { trainAccuracy, testAccuracy } = scoreResults(trainResults, testResults)

    const iterResult: AcilIterationResult = {
      iteration: i,
      phase,
      description: currentDescription,
      trainResults,
      testResults,
      trainAccuracy,
      testAccuracy,
    }
    iterations.push(iterResult)

    // Step 9: Write iteration JSONL
    await writeIterationOutput(runDir, runId, iterResult)

    // Step 10: Print iteration progress immediately after scoring
    printIterationProgress(iterResult, config.maxIterations, null)

    // Step 7: Improve description (unless last iteration)
    // During explore/transition phases, always generate new descriptions regardless of accuracy
    // During converge, only improve if accuracy is imperfect
    let newDescription: string | null = null
    const needsImprovement = phase !== 'converge' || (
      trainAccuracy < 1.0 ||
      (config.holdout > 0 && testAccuracy !== null && testAccuracy < 1.0)
    )

    if (i < config.maxIterations && needsImprovement) {
      process.stderr.write('  Generating improved description...\n')
      newDescription = await improveDescription({
        agentName:          agent.name,
        currentDescription,
        agentBody:          agent.body,
        trainResults,
        testResults,
        iterations,
        holdout:            config.holdout,
        phase,
        model:              config.model,
        debug:              config.debug,
      })
      if (newDescription !== null) {
        process.stderr.write(`  New description: ${newDescription}\n`)
      }
    }

    process.stderr.write('\n')

    // Early exit on perfect accuracy — only during or after converge phase
    const perfectTrain = trainAccuracy === 1.0
    const perfectTest  = testAccuracy === 1.0 || testAccuracy === null
    if (perfectTrain && perfectTest && hasReachedConverge) break

    if (newDescription !== null) currentDescription = newDescription
  }

  // Select best iteration
  const best = selectBestIteration(iterations, config.holdout)
  if (!best) {
    throw new HarnessError('No iterations completed — cannot select best iteration')
  }

  // Step 10: Print final summary
  printFinalSummary(iterations, best, best.description)

  // Step 9: Write summary JSON
  await writeSummaryOutput(runDir, runId, agent.description, iterations, best)

  // Step 8: Apply description
  if (best.description === agent.description) {
    process.stderr.write('\nBest description is identical to the original — no changes to apply.\n')
  } else if (config.apply) {
    await applyDescription(agentMdPath, best.description)
    process.stderr.write(`\nApplied best description to ${agentMdPath}\n`)
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    const answer = await rl.question('\nApply this description to agent .md? [y/N] ')
    rl.close()
    if (answer.trim().toLowerCase() === 'y') {
      await applyDescription(agentMdPath, best.description)
      process.stderr.write(`Applied best description to ${agentMdPath}\n`)
    }
  }
}
