export class HarnessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessError'
  }
}

export class ConfigNotFoundError extends HarnessError {
  constructor(configPath: string) {
    super(`tests.json not found: ${configPath}`)
    this.name = 'ConfigNotFoundError'
  }
}

export class RunNotFoundError extends HarnessError {
  constructor(runDir: string) {
    super(`Test run directory not found: ${runDir}`)
    this.name = 'RunNotFoundError'
  }
}
