import { buildTempPluginWithDescription } from '../test-runners/skill-call/build-temp-plugin.js'

export async function buildIterationPlugin(
  skillFile: string,
  runDir: string,
  description: string,
  repoRoot: string,
  iteration: number
): Promise<{ tempDir: string }> {
  return buildTempPluginWithDescription(skillFile, runDir, description, repoRoot, iteration)
}
