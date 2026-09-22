import path from 'node:path'
import { TEST_CONFIG_FILENAME } from '@testdouble/skillwalker-data'
import { ConfigNotFoundError } from '../../lib/errors.js'

export async function validateConfig(evalDir: string): Promise<{ configFilePath: string }> {
  const configFilePath = path.join(evalDir, TEST_CONFIG_FILENAME)
  if (!(await Bun.file(configFilePath).exists())) {
    throw new ConfigNotFoundError(configFilePath)
  }
  return { configFilePath }
}
