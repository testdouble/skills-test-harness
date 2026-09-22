import { existsSync } from 'node:fs'
import path from 'node:path'
import type { TestCase } from '@testdouble/skillwalker-data'
import { readEvalConfig, TEST_CONFIG_FILENAME } from '@testdouble/skillwalker-data'
import { SkillwalkerError } from '../lib/errors.js'

export interface ResolvedAgentAndTests {
  agentFile: string
  agentMdPath: string
  tests: TestCase[]
}

export async function resolveAndLoad(
  evalName: string,
  agent: string | undefined,
  testsDir: string,
  repoRoot: string,
): Promise<ResolvedAgentAndTests> {
  const evalDir = path.join(testsDir, 'evals', evalName)
  const configPath = path.join(evalDir, TEST_CONFIG_FILENAME)
  const config = await readEvalConfig(configPath)

  // Filter to agent-call tests only
  const agentCallTests = config.tests.filter((t) => t.type === 'agent-call')

  if (agent) {
    // Validate agent identifier format (must be plugin:agent)
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(agent)) {
      throw new SkillwalkerError(`Invalid agent identifier "${agent}". Expected format: plugin-name:agent-name`)
    }

    // Validate agent .md exists
    const [pluginName, agentName] = agent.split(':')
    const agentMdPath = path.join(repoRoot, pluginName, 'agents', `${agentName}.md`)

    // Guard against path traversal
    const resolved = path.resolve(agentMdPath)
    if (!resolved.startsWith(path.resolve(repoRoot) + path.sep)) {
      throw new SkillwalkerError(`Agent path "${resolved}" escapes repository root`)
    }

    if (!existsSync(agentMdPath)) {
      throw new SkillwalkerError(`Agent .md not found: ${agentMdPath}`)
    }

    // Filter tests to those targeting this agent
    const filtered = agentCallTests.filter((t) => {
      // Check test-level agentFile
      if (t.agentFile === agent) return true
      // Check expectations for agent-call type with matching agentFile
      return t.expect.some((e) => e.type === 'agent-call' && 'agentFile' in e && e.agentFile === agent)
    })

    if (filtered.length === 0) {
      throw new SkillwalkerError(`No agent-call tests found for agent "${agent}" in eval "${evalName}"`)
    }

    return { agentFile: agent, agentMdPath, tests: filtered }
  }

  // Infer agent from unique agentFile values across tests and expectations
  const agentFiles = new Set<string>()
  for (const test of agentCallTests) {
    for (const e of test.expect) {
      if (e.type === 'agent-call' && 'agentFile' in e) {
        agentFiles.add((e as { agentFile: string }).agentFile)
      }
    }
  }

  if (agentFiles.size === 0) {
    throw new SkillwalkerError(`No agent-call tests found in eval "${evalName}"`)
  }

  if (agentFiles.size > 1) {
    const options = Array.from(agentFiles).join(', ')
    throw new SkillwalkerError(`Multiple agents found in eval "${evalName}": ${options}. Use --agent to specify one.`)
  }

  const inferredAgent = Array.from(agentFiles)[0]

  if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(inferredAgent)) {
    throw new SkillwalkerError(
      `Invalid agent identifier "${inferredAgent}" inferred from test expectations. Expected format: plugin-name:agent-name`,
    )
  }

  const [pluginName, agentName] = inferredAgent.split(':')
  const agentMdPath = path.join(repoRoot, pluginName, 'agents', `${agentName}.md`)

  const resolved = path.resolve(agentMdPath)
  if (!resolved.startsWith(path.resolve(repoRoot) + path.sep)) {
    throw new SkillwalkerError(`Agent path "${resolved}" escapes repository root`)
  }

  if (!existsSync(agentMdPath)) {
    throw new SkillwalkerError(`Agent .md not found: ${agentMdPath}`)
  }

  return { agentFile: inferredAgent, agentMdPath, tests: agentCallTests }
}
