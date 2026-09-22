import type { TestSuiteConfig } from '@testdouble/skillwalker-data'
import { readTestSuiteConfig, validateScaffolds } from '@testdouble/skillwalker-data'
import { SkillwalkerError } from '../../lib/errors.js'

export async function readConfig(
  configFilePath: string,
  testSuiteDir: string,
  testFilter: string | undefined,
): Promise<TestSuiteConfig> {
  const config = await readTestSuiteConfig(configFilePath).catch((err: Error) => {
    throw new SkillwalkerError(`Failed to read config: ${err.message}`)
  })
  if (testFilter) {
    config.tests = config.tests.filter((t) => t.name === testFilter)
    if (config.tests.length === 0) {
      throw new SkillwalkerError(`Test not found: ${testFilter}`)
    }
  }
  try {
    validateScaffolds(testSuiteDir, config)
  } catch (err) {
    throw new SkillwalkerError((err as Error).message)
  }
  return config
}
