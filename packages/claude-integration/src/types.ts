export interface ClaudeRunOptions {
  model: string
  prompt: string
  pluginDirs?: string[]
  scaffold?: string | null
  debug?: boolean
}

export interface ClaudeRunResult {
  exitCode: number
  stdout: string
  stderr: string
}
