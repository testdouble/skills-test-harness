import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolvePromptPath, readPromptFile, parseStreamJsonLines } from '@testdouble/harness-data'
import { evaluateAgentCall } from '@testdouble/harness-evals'
import type { AcilTestCase, AcilQueryResult } from './types.js'
import { runClaude } from '@testdouble/claude-integration'

export interface RunEvalOptions {
  tempDir:        string
  testCases:      AcilTestCase[]
  suite:          string
  testsDir:       string
  concurrency:    number
  runsPerQuery:   number
  debug:          boolean
  testRunId:      string
  runDir:         string
}

async function runSingleQuery(
  test: AcilTestCase,
  runIndex: number,
  opts: RunEvalOptions
): Promise<AcilQueryResult> {
  const testSuiteDir = path.join(opts.testsDir, 'test-suites', opts.suite)
  const promptPath = resolvePromptPath(testSuiteDir, test.promptFile)
  const promptContent = await readPromptFile(promptPath)

  const scaffoldPath = test.scaffold
    ? path.join(testSuiteDir, 'scaffolds', test.scaffold)
    : null

  const { stdout } = await runClaude({
    model: test.model ?? 'sonnet',
    prompt: promptContent,
    pluginDirs: [opts.tempDir],
    scaffold: scaffoldPath,
    debug: opts.debug,
  })

  if (opts.debug && opts.runDir) {
    const debugDir = path.join(opts.runDir, 'debug')
    await mkdir(debugDir, { recursive: true })
    const safeName = test.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    await writeFile(path.join(debugDir, `${safeName}-run${runIndex}.jsonl`), stdout, 'utf-8')
  }

  const events = parseStreamJsonLines(stdout)

  const agentCallExpect = test.expect.find(e => e.type === 'agent-call')
  const expected = agentCallExpect ? (agentCallExpect as { value: boolean }).value : true
  const agentFile = test.agentFile ?? (agentCallExpect as { agentFile: string })?.agentFile ?? ''

  const actual = evaluateAgentCall(agentFile, true, events)
  const passed = expected === actual

  return {
    testName:      test.name,
    agentFile,
    promptContent,
    expected,
    actual,
    passed,
    runIndex,
    events
  }
}

function aggregateByMajorityVote(results: AcilQueryResult[]): AcilQueryResult {
  const sorted = [...results].sort((a, b) => a.runIndex - b.runIndex)
  const passCount = sorted.filter(r => r.passed).length
  const passed = passCount > sorted.length / 2
  return { ...sorted[0], passed, runIndex: 0 }
}

export async function runEval(opts: RunEvalOptions): Promise<AcilQueryResult[]> {
  // Build work items: each test case x each run
  const workItems: { test: AcilTestCase, runIndex: number }[] = []
  for (const test of opts.testCases) {
    for (let r = 0; r < opts.runsPerQuery; r++) {
      workItems.push({ test, runIndex: r })
    }
  }

  // Pre-size for index-based, deterministic storage
  const results = new Array<AcilQueryResult | undefined>(workItems.length)

  // Promise pool: maintain up to N concurrent sandbox exec calls
  const pending = new Set<Promise<void>>()
  let started = 0

  for (let workItemIndex = 0; workItemIndex < workItems.length; workItemIndex++) {
    const item = workItems[workItemIndex]
    started++
    process.stderr.write(`  [${started}/${workItems.length}] "${item.test.name}"...\n`)
    const task = runSingleQuery(item.test, item.runIndex, opts)
      .then(result => {
        results[workItemIndex] = result
      })
      .catch(err => {
        process.stderr.write(`  [error] "${item.test.name}" run ${item.runIndex} failed: ${err}\n`)
      })

    const tracked = task.then(() => { pending.delete(tracked) })
    pending.add(tracked)

    if (pending.size >= opts.concurrency) {
      await Promise.race(pending)
    }
  }

  // Wait for remaining
  await Promise.all(pending)

  const completed = results.filter((r): r is AcilQueryResult => r !== undefined)

  // Aggregate by majority vote if runsPerQuery > 1
  if (opts.runsPerQuery > 1) {
    const grouped = new Map<string, AcilQueryResult[]>()
    for (const r of completed) {
      const key = r.testName
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(r)
    }
    return Array.from(grouped.values()).map(aggregateByMajorityVote)
  }

  return completed
}
