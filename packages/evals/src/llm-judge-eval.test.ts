import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluateLlmJudge } from './llm-judge-eval.js'
import type { TestConfigRecord } from '@testdouble/harness-data'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

vi.mock('@testdouble/harness-data', () => ({
  buildTestCaseId: vi.fn((suite: string, name: string) => `${suite}-${name}`),
  getResultText: vi.fn(),
  parseStreamJsonLines: vi.fn(),
  readJsonlFile: vi.fn(),
}))

vi.mock('@testdouble/claude-integration', () => ({
  runClaude: vi.fn(),
}))

vi.mock('./rubric-parser.js', () => ({
  parseRubricSections: vi.fn(),
}))

vi.mock('./llm-judge-prompt.js', () => ({
  buildJudgePrompt: vi.fn(),
}))

const { readFile } = await import('node:fs/promises')
const { getResultText, parseStreamJsonLines, readJsonlFile } = await import('@testdouble/harness-data')
const { runClaude } = await import('@testdouble/claude-integration')
const { parseRubricSections } = await import('./rubric-parser.js')
const { buildJudgePrompt } = await import('./llm-judge-prompt.js')

function makeJudgeConfig(overrides?: Partial<TestConfigRecord>): TestConfigRecord {
  return {
    test_run_id: '20260327T120000',
    suite: 'test-suite',
    plugins: [],
    test: {
      name: 'my test',
      promptFile: 'prompt.md',
      expect: [{ type: 'llm-judge', rubricFile: 'rubric.md', model: 'opus', threshold: 1.0 }],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readJsonlFile).mockResolvedValue([])
})

describe('evaluateLlmJudge', () => {
  it('produces a result with status infrastructure-error when rubric read throws', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('rubric file not found'))

    const config = makeJudgeConfig()
    const results = await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')

    expect(results).toHaveLength(1)
    const result = results[0]
    expect(result.kind).toBe('llm-judge')
    expect(result.status).toBe('infrastructure-error')
    expect(result.error_message).toBe('rubric file not found')
    expect(result.passed).toBe(false)
    expect(result.judge_score).toBe(0)
    expect(result.criteria).toEqual([])
  })

  it('produces a result with status infrastructure-error when sandbox throws', async () => {
    vi.mocked(readFile).mockResolvedValue('## Presence\n- criterion one')
    vi.mocked(parseRubricSections).mockReturnValue([{ type: 'transcript', criteria: ['criterion one'] }])
    vi.mocked(getResultText).mockReturnValue('some result')
    vi.mocked(buildJudgePrompt).mockResolvedValue({ prompt: 'judge prompt', autoFailCriteria: [] })
    vi.mocked(runClaude).mockRejectedValue(new Error('sandbox timeout'))

    const config = makeJudgeConfig()
    const results = await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('infrastructure-error')
    expect(results[0].error_message).toBe('sandbox timeout')
    expect(results[0].criteria).toEqual([])
  })

  it('returns evaluated result with nested criteria on successful evaluation', async () => {
    vi.mocked(readFile).mockResolvedValue('## Presence\n- criterion one')
    vi.mocked(parseRubricSections).mockReturnValue([{ type: 'transcript', criteria: ['criterion one'] }])
    vi.mocked(getResultText)
      .mockReturnValueOnce('some result')
      .mockReturnValueOnce(JSON.stringify({ criteria: [{ criterion: 'criterion one', passed: true, reasoning: 'good' }] }))
    vi.mocked(buildJudgePrompt).mockResolvedValue({ prompt: 'judge prompt', autoFailCriteria: [] })
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
    vi.mocked(parseStreamJsonLines).mockReturnValue([])

    const config = makeJudgeConfig()
    const results = await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')

    expect(results).toHaveLength(1)
    const result = results[0]
    expect(result.kind).toBe('llm-judge')
    expect(result.status).toBe('evaluated')
    expect(result.error_message).toBeUndefined()
    expect(result.passed).toBe(true)
    expect(result.judge_score).toBe(1)
    expect(result.criteria).toHaveLength(1)
    expect(result.criteria[0]).toEqual({
      criterion: 'criterion one',
      passed: true,
      reasoning: 'good',
    })
  })

  it('returns empty array when no llm-judge expectations exist', async () => {
    const config: TestConfigRecord = {
      test_run_id: '20260327T120000',
      suite: 'test-suite',
      plugins: [],
      test: {
        name: 'my test',
        promptFile: 'prompt.md',
        expect: [{ type: 'result-contains', value: 'hello' }],
      },
    }
    const results = await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')
    expect(results).toEqual([])
  })

  it('passes test type context to buildJudgePrompt', async () => {
    vi.mocked(readFile).mockResolvedValue('## Presence\n- criterion one')
    vi.mocked(parseRubricSections).mockReturnValue([{ type: 'transcript', criteria: ['criterion one'] }])
    vi.mocked(getResultText)
      .mockReturnValueOnce('some result')
      .mockReturnValueOnce(JSON.stringify({ criteria: [{ criterion: 'criterion one', passed: true, reasoning: 'good' }] }))
    vi.mocked(buildJudgePrompt).mockResolvedValue({ prompt: 'judge prompt', autoFailCriteria: [] })
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
    vi.mocked(parseStreamJsonLines).mockReturnValue([])

    const config = makeJudgeConfig({
      test: {
        name: 'agent test',
        type: 'agent-prompt',
        promptFile: 'prompt.md',
        agentFile: 'r-and-d:gap-analyzer',
        expect: [{ type: 'llm-judge', rubricFile: 'rubric.md', model: 'opus', threshold: 1.0 }],
      },
    })
    await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')

    expect(buildJudgePrompt).toHaveBeenCalledWith(
      [{ type: 'transcript', criteria: ['criterion one'] }],
      'some result',
      null,
      [],
      expect.any(Map),
      { testType: 'agent-prompt' }
    )
  })

  it('marks empty rubric as infrastructure-error', async () => {
    vi.mocked(readFile).mockResolvedValue('## Presence\n(no bullets)')
    vi.mocked(parseRubricSections).mockReturnValue([])

    const config = makeJudgeConfig()
    const results = await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('infrastructure-error')
    expect(results[0].error_message).toContain('No criteria found')
  })

  it('passes output files to judge prompt when matched by buildTestCaseId', async () => {
    vi.mocked(readJsonlFile).mockResolvedValue([
      { test_run_id: '20260327T120000', test_name: 'test-suite-my test', file_path: 'docs/output.md', file_content: '# Analysis' }
    ])
    vi.mocked(readFile).mockResolvedValue('## File: docs/output.md\n### Presence\n- The file contains analysis')
    vi.mocked(parseRubricSections).mockReturnValue([
      { type: 'file', filePath: 'docs/output.md', criteria: ['The file contains analysis'] }
    ])
    vi.mocked(getResultText)
      .mockReturnValueOnce('some result')
      .mockReturnValueOnce(JSON.stringify({ criteria: [{ criterion: 'The file contains analysis', passed: true, reasoning: 'good' }] }))
    vi.mocked(buildJudgePrompt).mockResolvedValue({ prompt: 'judge prompt', autoFailCriteria: [] })
    vi.mocked(runClaude).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
    vi.mocked(parseStreamJsonLines).mockReturnValue([])

    const config = makeJudgeConfig()
    const results = await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')

    expect(buildJudgePrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      null,
      [],
      new Map([['docs/output.md', '# Analysis']]),
      expect.anything()
    )
    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].criteria[0].reasoning).toBe('good')
  })

  it('auto-fails criteria for missing output files', async () => {
    vi.mocked(readFile).mockResolvedValue('## File: docs/output.md\n- The file contains analysis')
    vi.mocked(parseRubricSections).mockReturnValue([
      { type: 'file', filePath: 'docs/output.md', criteria: ['The file contains analysis'] }
    ])
    vi.mocked(getResultText).mockReturnValue('some result')
    vi.mocked(buildJudgePrompt).mockResolvedValue({
      prompt: 'judge prompt',
      autoFailCriteria: ['The file contains analysis'],
    })

    const config = makeJudgeConfig()
    const results = await evaluateLlmJudge(config, [], '20260327T120000', '/fake/suite', '/fake/run')

    expect(results).toHaveLength(1)
    const result = results[0]
    expect(result.status).toBe('evaluated')
    expect(result.passed).toBe(false)
    expect(result.judge_score).toBe(0)
    expect(result.criteria).toHaveLength(1)
    expect(result.criteria[0]).toEqual({
      criterion: 'The file contains analysis',
      passed: false,
      reasoning: 'Output file was not produced by the agent',
    })
  })
})
