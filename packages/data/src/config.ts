import { existsSync } from 'node:fs'
import path from 'node:path'
import type { TestExpectation, TestSuiteConfig } from './types.js'

const VALID_TEST_TYPES = ['skill-prompt', 'skill-call', 'agent-call', 'agent-prompt'] as const

export async function readTestSuiteConfig(configFilePath: string): Promise<TestSuiteConfig> {
  const file = Bun.file(configFilePath)
  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${configFilePath}`)
  }
  let config: TestSuiteConfig
  try {
    config = JSON.parse(await file.text()) as TestSuiteConfig
  } catch (e) {
    throw new Error(`Invalid JSON in config file: ${configFilePath}: ${e}`)
  }
  config.tests = config.tests.map(test => {
    if (!test.type) {
      throw new Error(`Test "${test.name}" missing required "type" field`)
    }
    if (!VALID_TEST_TYPES.includes(test.type as typeof VALID_TEST_TYPES[number])) {
      throw new Error(`Test "${test.name}" has unknown type "${test.type}"`)
    }
    if (test.type === 'agent-prompt' && !test.agentFile) {
      throw new Error(`Test "${test.name}" with type "agent-prompt" requires "agentFile"`)
    }
    return {
    ...test,
    model: test.model ?? 'sonnet',
    expect: test.expect.map(e => {
      const [type, value] = Object.entries(e)[0]
      if (type === 'llm-judge') {
          const obj = value as Record<string, unknown>
          if (typeof obj.rubricFile !== 'string') {
            throw new Error(`llm-judge expectation missing required "rubricFile" string in test "${test.name}"`)
          }
          return {
            type: 'llm-judge',
            rubricFile: obj.rubricFile,
            model: typeof obj.model === 'string' ? obj.model : undefined,
            threshold: typeof obj.threshold === 'number' ? obj.threshold : undefined,
          } as TestExpectation
        }
      if (type === 'skill-call') {
        if (typeof value === 'object' && value !== null) {
          // Full format: { "skill-call": { "skill": "...", "expected": true/false } }
          const obj = value as Record<string, unknown>
          if (typeof obj.skill !== 'string') {
            throw new Error(`skill-call expectation missing required "skill" string in test "${test.name}"`)
          }
          if (typeof obj.expected !== 'boolean') {
            throw new Error(`skill-call expectation missing required "expected" boolean in test "${test.name}"`)
          }
          return { type: 'skill-call', value: obj.expected, skillFile: obj.skill } as TestExpectation
        }
        // Simplified format: { "skill-call": true/false } with test.skillFile
        if (typeof value !== 'boolean') {
          throw new Error(`skill-call expectation requires a boolean value or object in test "${test.name}"`)
        }
        if (!test.skillFile) {
          throw new Error(`skill-call expectation requires test.skillFile when using simplified boolean format in test "${test.name}"`)
        }
        return { type: 'skill-call', value, skillFile: test.skillFile } as TestExpectation
      }
      if (type === 'agent-call') {
        if (typeof value === 'object' && value !== null) {
          // Full format: { "agent-call": { "agent": "...", "expected": true/false } }
          const obj = value as Record<string, unknown>
          if (typeof obj.agent !== 'string') {
            throw new Error(`agent-call expectation missing required "agent" string in test "${test.name}"`)
          }
          if (typeof obj.expected !== 'boolean') {
            throw new Error(`agent-call expectation missing required "expected" boolean in test "${test.name}"`)
          }
          return { type: 'agent-call', value: obj.expected, agentFile: obj.agent } as TestExpectation
        }
        // Simplified format: { "agent-call": true/false } with test.agentFile
        if (typeof value !== 'boolean') {
          throw new Error(`agent-call expectation requires a boolean value or object in test "${test.name}"`)
        }
        if (!test.agentFile) {
          throw new Error(`agent-call expectation requires test.agentFile when using simplified boolean format in test "${test.name}"`)
        }
        return { type: 'agent-call', value, agentFile: test.agentFile } as TestExpectation
      }
      return { type, value } as TestExpectation
    }),
  }})
  return config
}

export function resolvePromptPath(testSuiteDir: string, promptFile: string): string {
  return path.join(testSuiteDir, 'prompts', promptFile)
}

export async function readPromptFile(promptPath: string): Promise<string> {
  const file = Bun.file(promptPath)
  if (!(await file.exists())) {
    throw new Error(`Prompt file not found: ${promptPath}`)
  }
  return file.text()
}

export function buildTestCaseId(suite: string, testName: string): string {
  const normalized = testName.replace(/ /g, '-').replace(/[^a-zA-Z0-9-]/g, '')
  return `${suite}-${normalized}`
}

export function validateScaffolds(testSuiteDir: string, config: TestSuiteConfig): void {
  for (const test of config.tests) {
    if (test.scaffold) {
      const scaffoldPath = path.join(testSuiteDir, 'scaffolds', test.scaffold)
      if (!existsSync(scaffoldPath)) {
        throw new Error(`Scaffold directory not found: ${scaffoldPath} (test "${test.name}")`)
      }
    }
  }
}
