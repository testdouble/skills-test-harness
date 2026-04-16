import type { ParsedRunMetrics, TestSuiteConfig } from '@testdouble/harness-data'
import mockParsedMetricsJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-parsed-metrics.json'
import mockTestSuiteConfigJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-test-suite-config.json'
import { vi } from 'vitest'

export const mockTestSuiteConfig: TestSuiteConfig = mockTestSuiteConfigJson as TestSuiteConfig

export const mockParsedMetrics: ParsedRunMetrics = mockParsedMetricsJson as ParsedRunMetrics

export function makeFakeBunProc(exitCode: number, output = '') {
  const reader = {
    read: vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(output) })
      .mockResolvedValueOnce({ done: true, value: undefined }),
  }
  return {
    stdout: { getReader: () => reader },
    exited: Promise.resolve(),
    exitCode,
  }
}
