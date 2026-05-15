export class SandboxError extends Error {
  constructor(
    message: string,
    public exitCode: number | null,
  ) {
    super(message)
    this.name = 'SandboxError'
  }
}
