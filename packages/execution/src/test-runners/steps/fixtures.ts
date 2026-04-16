import { vi } from 'vitest'
import type { TestSuiteConfig, ParsedRunMetrics } from '@testdouble/harness-data'
import mockTestSuiteConfigJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-test-suite-config.json'
import mockParsedMetricsJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-parsed-metrics.json'

export const mockTestSuiteConfig: TestSuiteConfig = mockTestSuiteConfigJson as TestSuiteConfig

export const mockParsedMetrics: ParsedRunMetrics = mockParsedMetricsJson as ParsedRunMetrics

export function makeFakeBunProc(exitCode: number, output = '') {
  const reader = {
    read: vi.fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(output) })
      .mockResolvedValueOnce({ done: true, value: undefined }),
  }
  return {
    stdout: { getReader: () => reader },
    exited: Promise.resolve(),
    exitCode,
  }
}
