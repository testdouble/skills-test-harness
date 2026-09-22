import fs from 'node:fs'
import path from 'node:path'
import { createPathConfig } from '@testdouble/skillwalker-execution'

const config = createPathConfig(process.cwd())

export const testsDir = config.testsDir
export const skillwalkerDir = config.skillwalkerDir
export const outputDir = config.outputDir
export const dataDir = config.dataDir

export function getEvalDir(evalName: string): string {
  return path.join(config.testsDir, 'evals', evalName)
}

export function getAllEvals(): string[] {
  const evalsDir = path.join(config.testsDir, 'evals')
  return fs.readdirSync(evalsDir).filter((entry) => fs.statSync(path.join(evalsDir, entry)).isDirectory())
}
