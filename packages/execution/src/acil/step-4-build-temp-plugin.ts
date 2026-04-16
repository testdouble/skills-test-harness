import { buildTempAgentPluginWithDescription } from '../test-runners/agent-call/build-temp-plugin.js'

export async function buildIterationPlugin(
  agentFile: string,
  runDir: string,
  description: string,
  repoRoot: string,
  iteration: number,
): Promise<{ tempDir: string }> {
  return buildTempAgentPluginWithDescription(agentFile, runDir, description, repoRoot, iteration)
}
