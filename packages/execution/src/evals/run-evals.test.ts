import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@testdouble/sandbox-integration', () => ({
  ensureSandboxExists: vi.fn(),
}))
vi.mock('../test-runners/steps/step-4-generate-run-id.js', () => ({
  generateRunId: vi.fn(),
}))
vi.mock('../test-runners/steps/step-7-init-totals.js', () => ({
  initTotals: vi.fn(),
}))
vi.mock('../test-runners/steps/step-9-print-totals.js', () => ({
  printTotals: vi.fn(),
}))

import { sandboxScriptsDir } from '@testdouble/claude-integration'
import { ensureSandboxExists } from '@testdouble/sandbox-integration'
import { generateRunId } from '../test-runners/steps/step-4-generate-run-id.js'
import { initTotals } from '../test-runners/steps/step-7-init-totals.js'
import { runEvals } from './run-evals.js'

beforeEach(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.mocked(ensureSandboxExists).mockResolvedValue(undefined)
  vi.mocked(generateRunId).mockReturnValue('20260922T000000')
  vi.mocked(initTotals).mockReturnValue({
    totalDurationMs: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    failures: 0,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runEvals', () => {
  it('requires the sandbox to mount the sandbox scripts directory', async () => {
    await runEvals({ evals: [], debug: false, outputDir: '/out', testsDir: '/tests', repoRoot: '/repo' })

    expect(ensureSandboxExists).toHaveBeenCalledWith([sandboxScriptsDir])
  })
})
