export async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return []
  }
  const text = await file.text()
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T)
}
