export class SkillwalkerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillwalkerError'
  }
}

export class ConfigNotFoundError extends SkillwalkerError {
  constructor(configPath: string) {
    super(`tests.json not found: ${configPath}`)
    this.name = 'ConfigNotFoundError'
  }
}

export class RunNotFoundError extends SkillwalkerError {
  constructor(runDir: string) {
    super(`Test run directory not found: ${runDir}`)
    this.name = 'RunNotFoundError'
  }
}
