export interface Scoreable {
  passed: boolean
}

export interface ScoredIteration {
  iteration: number
  trainAccuracy: number
  testAccuracy: number | null
}

export function scoreResults(
  trainResults: Scoreable[],
  testResults: Scoreable[],
): { trainAccuracy: number; testAccuracy: number | null } {
  const trainAccuracy =
    trainResults.length === 0 ? 0 : trainResults.filter((r) => r.passed).length / trainResults.length

  const testAccuracy = testResults.length === 0 ? null : testResults.filter((r) => r.passed).length / testResults.length

  return { trainAccuracy, testAccuracy }
}

export function selectBestIteration<T extends ScoredIteration>(iterations: T[], holdout: number): T | null {
  if (iterations.length === 0) return null

  const useTestScore = holdout > 0

  let best = iterations[0]
  for (let i = 1; i < iterations.length; i++) {
    const current = iterations[i]
    const rawCurrent = useTestScore ? (current.testAccuracy ?? 0) : current.trainAccuracy
    const rawBest = useTestScore ? (best.testAccuracy ?? 0) : best.trainAccuracy
    const currentScore = isNaN(rawCurrent) ? 0 : rawCurrent
    const bestScore = isNaN(rawBest) ? 0 : rawBest

    // Strictly greater — earlier iteration wins ties
    // When primary scores are equal, use train accuracy as tiebreaker
    const currentTrain = isNaN(current.trainAccuracy) ? 0 : current.trainAccuracy
    const bestTrain = isNaN(best.trainAccuracy) ? 0 : best.trainAccuracy

    if (currentScore > bestScore) {
      best = current
    } else if (currentScore === bestScore && currentTrain > bestTrain) {
      best = current
    }
  }

  return best
}
