export function exitWithResult(failures: number): never {
  process.exit(failures > 0 ? 1 : 0)
}
