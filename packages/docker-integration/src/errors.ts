export class DockerError extends Error {
  constructor(message: string, public exitCode: number | null) {
    super(message)
    this.name = 'DockerError'
  }
}
