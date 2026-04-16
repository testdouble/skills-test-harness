import type { RunTotals, TestSuiteConfig } from '@testdouble/harness-data'
import { runAgentCallTests } from '../agent-call/index.js'
import { runAgentPromptTests } from '../agent-prompt/index.js'
import { runPromptTests } from '../prompt/index.js'
import { runSkillCallTests } from '../skill-call/index.js'

export async function runTestCases(
  config: TestSuiteConfig,
  suite: string,
  testSuiteDir: string,
  pluginDirs: string[],
  debug: boolean,
  testRunId: string,
  totals: RunTotals,
  outputDir: string,
  repoRoot: string,
): Promise<RunTotals> {
  const skillPromptTests = config.tests.filter((t) => t.type === 'skill-prompt')
  const skillCallTests = config.tests.filter((t) => t.type === 'skill-call')
  const agentCallTests = config.tests.filter((t) => t.type === 'agent-call')
  const agentPromptTests = config.tests.filter((t) => t.type === 'agent-prompt')

  let current = await runPromptTests(
    skillPromptTests,
    config,
    suite,
    testSuiteDir,
    pluginDirs,
    debug,
    testRunId,
    totals,
    outputDir,
  )
  current = await runSkillCallTests(
    skillCallTests,
    config,
    suite,
    testSuiteDir,
    debug,
    testRunId,
    current,
    outputDir,
    repoRoot,
  )
  current = await runAgentCallTests(
    agentCallTests,
    config,
    suite,
    testSuiteDir,
    debug,
    testRunId,
    current,
    outputDir,
    repoRoot,
  )
  current = await runAgentPromptTests(
    agentPromptTests,
    config,
    suite,
    testSuiteDir,
    pluginDirs,
    debug,
    testRunId,
    current,
    outputDir,
  )
  return current
}
