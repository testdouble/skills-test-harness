import type { TestCase, ScilTestCase } from './types.js'

// Simple seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return hash
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function getExpectedTrigger(test: TestCase): boolean {
  for (const e of test.expect) {
    if (e.type === 'skill-call' || e.type === 'agent-call') {
      return (e as { value: boolean }).value
    }
  }
  return true
}

export function splitSets(
  suite: string,
  entityFile: string,
  tests: TestCase[],
  holdout: number
): ScilTestCase[] {
  // Holdout 0 → all train, empty test
  if (holdout === 0) {
    return tests.map(t => ({ ...t, set: 'train' as const }))
  }

  const seed = hashString(`${suite}:${entityFile}`)
  const rng = mulberry32(seed)

  // Stratify by expected trigger value
  const positives = tests.filter(t => getExpectedTrigger(t) === true)
  const negatives = tests.filter(t => getExpectedTrigger(t) === false)

  const assignSplit = (group: TestCase[]): ScilTestCase[] => {
    if (group.length === 0) return []

    const shuffled = seededShuffle(group, rng)
    const testCount = Math.max(1, Math.round(shuffled.length * holdout))

    // Ensure at least 1 in train if possible
    const actualTestCount = Math.min(testCount, shuffled.length - 1)

    if (actualTestCount <= 0) {
      return shuffled.map(t => ({ ...t, set: 'train' as const }))
    }

    return shuffled.map((t, i) => ({
      ...t,
      set: (i < actualTestCount ? 'test' : 'train') as 'train' | 'test'
    }))
  }

  return [...assignSplit(positives), ...assignSplit(negatives)]
}
