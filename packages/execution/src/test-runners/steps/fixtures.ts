import type { ParsedRunMetrics, EvalConfig } from '@testdouble/skillwalker-data'
import mockParsedMetricsJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-parsed-metrics.json'
import mockEvalConfigJson from '@testdouble/test-fixtures/cli/test-runners/steps/mock-eval-config.json'
import { vi } from 'vitest'

export const mockEvalConfig: EvalConfig = mockEvalConfigJson as EvalConfig

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
