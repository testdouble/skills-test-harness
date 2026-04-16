import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendTestConfig, appendTestResults, appendTestRun, ensureOutputDir } from './jsonl-writer.js'
import type { StreamJsonEvent, TestConfigRecord, TestResultRecord } from './types.js'

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
}))

import { mkdir } from 'node:fs/promises'

const mockMkdir = mkdir as ReturnType<typeof vi.fn>

import { appendFile } from 'node:fs/promises'

const mockAppendFile = appendFile as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ensureOutputDir', () => {
  it('calls mkdir with recursive: true', async () => {
    await ensureOutputDir('/output/run-1')
    expect(mockMkdir).toHaveBeenCalledWith('/output/run-1', { recursive: true })
  })
})

describe('appendTestConfig', () => {
  it('writes a JSON line to test-config.jsonl', async () => {
    const record: TestConfigRecord = {
      test_run_id: 'run-1',
      suite: 'my-suite',
      plugins: ['plugin-a'],
      test: { name: 'test 1', promptFile: 'prompt.md', expect: [] },
    }
    await appendTestConfig('/output/run-1', record)
    expect(mockAppendFile).toHaveBeenCalledWith('/output/run-1/test-config.jsonl', `${JSON.stringify(record)}\n`)
  })
})

describe('appendTestRun', () => {
  it('adds test_run_id to all events', async () => {
    const events: StreamJsonEvent[] = [
      { type: 'system', subtype: 'init', session_id: 'abc' },
      { type: 'assistant', message: {} },
    ]
    await appendTestRun('/output/run-1', events, 'run-1', 'suite-test-name')
    const written = mockAppendFile.mock.calls[0][1] as string
    const lines = written
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines[0].test_run_id).toBe('run-1')
    expect(lines[1].test_run_id).toBe('run-1')
  })

  it('adds test_case to all events', async () => {
    const events: StreamJsonEvent[] = [
      { type: 'system', subtype: 'init', session_id: 'abc' },
      { type: 'result', result: 'done' },
    ]
    await appendTestRun('/output/run-1', events, 'run-1', 'suite-test-name')
    const written = mockAppendFile.mock.calls[0][1] as string
    const lines = written
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines[0].test_case).toBe('suite-test-name')
    expect(lines[1].test_case).toBe('suite-test-name')
  })

  it('writes to test-run.jsonl', async () => {
    await appendTestRun('/output/run-1', [{ type: 'result', result: 'x' }], 'run-1', 'tc')
    expect(mockAppendFile.mock.calls[0][0]).toBe('/output/run-1/test-run.jsonl')
  })

  it('writes a bare newline when events array is empty (EC4)', async () => {
    await appendTestRun('/output/run-1', [], 'run-1', 'tc')
    const written = mockAppendFile.mock.calls[0][1] as string
    expect(written).toBe('\n')
  })
})

describe('appendTestResults', () => {
  it('writes each record as a JSON line', async () => {
    const records: TestResultRecord[] = [
      {
        test_run_id: 'run-1',
        suite: 's',
        test_name: 'n',
        expect_type: 'result-contains',
        expect_value: 'ok',
        passed: true,
      },
      {
        test_run_id: 'run-1',
        suite: 's',
        test_name: 'n',
        expect_type: 'skill-call',
        expect_value: 'my-skill',
        passed: false,
      },
    ]
    await appendTestResults('/output/run-1', records)
    const written = mockAppendFile.mock.calls[0][1] as string
    const lines = written
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject(records[0])
    expect(lines[1]).toMatchObject(records[1])
  })

  it('writes to test-results.jsonl', async () => {
    await appendTestResults('/output/run-1', [])
    expect(mockAppendFile.mock.calls[0][0]).toBe('/output/run-1/test-results.jsonl')
  })
})
