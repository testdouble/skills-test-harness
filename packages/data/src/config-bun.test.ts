import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readTestSuiteConfig, readPromptFile } from './config.js'

function makeBunFile(exists: boolean, text?: string) {
  return {
    exists: vi.fn().mockResolvedValue(exists),
    text: vi.fn().mockResolvedValue(text ?? ''),
  }
}

beforeEach(() => {
  vi.stubGlobal('Bun', { file: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readTestSuiteConfig', () => {
  it('throws when config file does not exist', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(false))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('Config file not found')
  })

  it('throws on invalid JSON', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, 'not json'))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('Invalid JSON in config file')
  })

  it('normalizes result-contains expectations from {type: value} shorthand to {type, value} objects', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-prompt',
        promptFile: 'prompt.md',
        expect: [
          { 'result-contains': 'hello' },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'result-contains', value: 'hello' },
    ])
  })

  it('normalizes result-does-not-contain as a standalone expectation', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-prompt',
        promptFile: 'prompt.md',
        expect: [
          { 'result-does-not-contain': 'goodbye' },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'result-does-not-contain', value: 'goodbye' },
    ])
  })

  it('normalizes skill-call expectations with boolean value and skillFile from the test definition', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-call',
        promptFile: 'prompt.md',
        skillFile: 'r-and-d:code-review',
        expect: [
          { 'skill-call': true },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'skill-call', value: true, skillFile: 'r-and-d:code-review' },
    ])
  })

  it('normalizes skill-call expectations with value: false when skill should not be called', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-call',
        promptFile: 'prompt.md',
        skillFile: 'r-and-d:code-review',
        expect: [
          { 'skill-call': false },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'skill-call', value: false, skillFile: 'r-and-d:code-review' },
    ])
  })

  it('normalizes full skill-call object format with expected: true', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-call',
        promptFile: 'prompt.md',
        expect: [
          { 'skill-call': { skill: 'r-and-d:code-review', expected: true } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'skill-call', value: true, skillFile: 'r-and-d:code-review' },
    ])
  })

  it('normalizes full skill-call object format with expected: false', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-call',
        promptFile: 'prompt.md',
        expect: [
          { 'skill-call': { skill: 'r-and-d:code-review', expected: false } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'skill-call', value: false, skillFile: 'r-and-d:code-review' },
    ])
  })

  it('full format skill takes precedence over test.skillFile', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-call',
        promptFile: 'prompt.md',
        skillFile: 'r-and-d:investigate',
        expect: [
          { 'skill-call': { skill: 'r-and-d:code-review', expected: true } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'skill-call', value: true, skillFile: 'r-and-d:code-review' },
    ])
  })

  it('full format ignores extra unknown properties', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'skill-call',
        promptFile: 'prompt.md',
        expect: [
          { 'skill-call': { skill: 'r-and-d:code-review', expected: true, extra: 'ignored' } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'skill-call', value: true, skillFile: 'r-and-d:code-review' },
    ])
  })

  it('defaults model to "sonnet" when absent', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{ name: 't', type: 'skill-prompt', promptFile: 'p.md', expect: [] }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].model).toBe('sonnet')
  })

  it('preserves explicit model value', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{ name: 't', type: 'skill-prompt', promptFile: 'p.md', model: 'opus', expect: [] }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].model).toBe('opus')
  })

  it('preserves scaffold field on test cases', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{ name: 't', type: 'skill-prompt', promptFile: 'p.md', scaffold: 'ruby-project', expect: [] }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].scaffold).toBe('ruby-project')
  })

  it('returns empty tests array when tests is [] (EC11)', async () => {
    const raw = JSON.stringify({ plugins: [], tests: [] })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests).toEqual([])
  })

  it('silently drops all but first key when an expectation object has multiple keys (EC4)', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'result-contains': 'hello', 'result-does-not-contain': 'goodbye' }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    // Only the first key-value pair is used; the second expectation is silently dropped
    expect(config.tests[0].expect).toHaveLength(1)
    expect(config.tests[0].expect[0]).toMatchObject({ type: 'result-contains', value: 'hello' })
  })

  it('throws when full format is missing skill property', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'skill-call': { expected: true } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "skill" string')
  })

  it('throws when full format is missing expected property', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'skill-call': { skill: 'r-and-d:code-review' } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "expected" boolean')
  })

  it('throws when full format is an empty object', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'skill-call': {} }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "skill" string')
  })

  it('throws when full format skill is not a string', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'skill-call': { skill: 123, expected: true } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "skill" string')
  })

  it('throws when full format expected is not a boolean', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'skill-call': { skill: 'r-and-d:code-review', expected: 'yes' } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "expected" boolean')
  })

  it('throws when simplified format value is not a boolean', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-call',
        promptFile: 'p.md',
        skillFile: 'r-and-d:code-review',
        expect: [{ 'skill-call': 'yes' }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('requires a boolean value or object')
  })

  it('throws when simplified format is used without test.skillFile (EC3)', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-call',
        promptFile: 'p.md',
        expect: [{ 'skill-call': true }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('requires test.skillFile when using simplified boolean format')
  })
})

describe('readTestSuiteConfig (agent-call expectations)', () => {
  it('normalizes agent-call expectations with boolean value and agentFile from the test definition', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'agent-call',
        promptFile: 'prompt.md',
        agentFile: 'r-and-d:gap-analyzer',
        expect: [
          { 'agent-call': true },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' },
    ])
  })

  it('normalizes agent-call expectations with value: false when agent should not be called', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'agent-call',
        promptFile: 'prompt.md',
        agentFile: 'r-and-d:gap-analyzer',
        expect: [
          { 'agent-call': false },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'agent-call', value: false, agentFile: 'r-and-d:gap-analyzer' },
    ])
  })

  it('normalizes full agent-call object format with expected: true', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'agent-call',
        promptFile: 'prompt.md',
        expect: [
          { 'agent-call': { agent: 'r-and-d:gap-analyzer', expected: true } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' },
    ])
  })

  it('normalizes full agent-call object format with expected: false', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'agent-call',
        promptFile: 'prompt.md',
        expect: [
          { 'agent-call': { agent: 'r-and-d:gap-analyzer', expected: false } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'agent-call', value: false, agentFile: 'r-and-d:gap-analyzer' },
    ])
  })

  it('full format agent takes precedence over test.agentFile', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'agent-call',
        promptFile: 'prompt.md',
        agentFile: 'r-and-d:structural-analyst',
        expect: [
          { 'agent-call': { agent: 'r-and-d:gap-analyzer', expected: true } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' },
    ])
  })

  it('throws when full format is missing agent property', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'agent-call': { expected: true } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "agent" string')
  })

  it('throws when full format is missing expected property', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'agent-call': { agent: 'r-and-d:gap-analyzer' } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "expected" boolean')
  })

  it('throws when full format is an empty object', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'agent-call': {} }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "agent" string')
  })

  it('throws when full format agent is not a string', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'agent-call': { agent: 123, expected: true } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "agent" string')
  })

  it('throws when full format expected is not a boolean', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [{ 'agent-call': { agent: 'r-and-d:gap-analyzer', expected: 'yes' } }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "expected" boolean')
  })

  it('throws when simplified format value is not a boolean', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'agent-call',
        promptFile: 'p.md',
        agentFile: 'r-and-d:gap-analyzer',
        expect: [{ 'agent-call': 'yes' }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('requires a boolean value or object')
  })

  it('throws when simplified format is used without test.agentFile', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'agent-call',
        promptFile: 'p.md',
        expect: [{ 'agent-call': true }],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('requires test.agentFile when using simplified boolean format')
  })

  it('preserves agentFile field on test cases', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{ name: 't', type: 'agent-call', promptFile: 'p.md', agentFile: 'r-and-d:gap-analyzer', expect: [] }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].agentFile).toBe('r-and-d:gap-analyzer')
  })

  it('full format ignores extra unknown properties', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'my test',
        type: 'agent-call',
        promptFile: 'prompt.md',
        expect: [
          { 'agent-call': { agent: 'r-and-d:gap-analyzer', expected: true, extra: 'ignored' } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' },
    ])
  })
})

describe('readTestSuiteConfig (llm-judge expectations)', () => {
  it('normalizes llm-judge expectation with all fields', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [
          { 'llm-judge': { rubricFile: 'rubric.md', model: 'opus', threshold: 0.8 } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'llm-judge', rubricFile: 'rubric.md', model: 'opus', threshold: 0.8 },
    ])
  })

  it('defaults model and threshold to undefined when omitted', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [
          { 'llm-judge': { rubricFile: 'rubric.md' } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'llm-judge', rubricFile: 'rubric.md', model: undefined, threshold: undefined },
    ])
  })

  it('throws when rubricFile is missing', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [
          { 'llm-judge': { model: 'opus' } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "rubricFile" string')
  })

  it('throws when rubricFile is not a string', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [
          { 'llm-judge': { rubricFile: 123 } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "rubricFile" string')
  })

  it('treats non-string model as undefined', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [
          { 'llm-judge': { rubricFile: 'rubric.md', model: 42 } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect[0]).toMatchObject({ type: 'llm-judge', model: undefined })
  })

  it('treats non-number threshold as undefined', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{
        name: 't',
        type: 'skill-prompt',
        promptFile: 'p.md',
        expect: [
          { 'llm-judge': { rubricFile: 'rubric.md', threshold: 'high' } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect[0]).toMatchObject({ type: 'llm-judge', threshold: undefined })
  })
})

describe('readTestSuiteConfig (mixed expectations)', () => {
  it('parses mixed expectation types in a single test case', async () => {
    const raw = JSON.stringify({
      plugins: ['plugin-a'],
      tests: [{
        name: 'mixed test',
        type: 'agent-call',
        promptFile: 'prompt.md',
        skillFile: 'r-and-d:code-review',
        agentFile: 'r-and-d:gap-analyzer',
        expect: [
          { 'result-contains': 'hello' },
          { 'agent-call': true },
          { 'skill-call': { skill: 'r-and-d:investigate', expected: false } },
        ],
      }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests[0].expect).toEqual([
      { type: 'result-contains', value: 'hello' },
      { type: 'agent-call', value: true, agentFile: 'r-and-d:gap-analyzer' },
      { type: 'skill-call', value: false, skillFile: 'r-and-d:investigate' },
    ])
  })
})

describe('readTestSuiteConfig (missing tests property)', () => {
  it('throws TypeError when config JSON has no tests property (EC4)', async () => {
    const raw = JSON.stringify({ plugins: [] })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow(TypeError)
  })

  it('throws TypeError when tests is null (EC4)', async () => {
    const raw = JSON.stringify({ plugins: [], tests: null })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow(TypeError)
  })
})

describe('readTestSuiteConfig (type field validation)', () => {
  it('throws when type field is missing', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{ name: 't', promptFile: 'p.md', expect: [] }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('missing required "type" field')
  })

  it('throws when type is an unknown value', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{ name: 't', type: 'banana', promptFile: 'p.md', expect: [] }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('has unknown type "banana"')
  })

  it('throws when agent-prompt test is missing agentFile', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [{ name: 't', type: 'agent-prompt', promptFile: 'p.md', expect: [] }],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    await expect(readTestSuiteConfig('/suite/tests.json')).rejects.toThrow('requires "agentFile"')
  })

  it('accepts all valid test types', async () => {
    const raw = JSON.stringify({
      plugins: [],
      tests: [
        { name: 'a', type: 'skill-prompt', promptFile: 'a.md', expect: [] },
        { name: 'b', type: 'skill-call', promptFile: 'b.md', skillFile: 'p:s', expect: [] },
        { name: 'c', type: 'agent-call', promptFile: 'c.md', agentFile: 'p:a', expect: [] },
        { name: 'd', type: 'agent-prompt', promptFile: 'd.md', agentFile: 'p:a', expect: [] },
      ],
    })
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, raw))
    const config = await readTestSuiteConfig('/suite/tests.json')
    expect(config.tests).toHaveLength(4)
  })
})

describe('readPromptFile', () => {
  it('returns file contents when file exists', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(true, 'prompt content here'))
    const result = await readPromptFile('/suite/prompts/test.md')
    expect(result).toBe('prompt content here')
  })

  it('throws when file does not exist', async () => {
    ;(globalThis as any).Bun.file.mockReturnValue(makeBunFile(false))
    await expect(readPromptFile('/suite/prompts/missing.md')).rejects.toThrow('Prompt file not found')
  })
})
