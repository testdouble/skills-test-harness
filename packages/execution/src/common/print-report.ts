export interface PrintableResult {
  passed:   boolean
  expected: boolean
  testName: string
}

export interface PrintableIteration {
  iteration:     number
  phase?:        string
  description:   string
  trainResults:  PrintableResult[]
  testResults:   PrintableResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

export function printIterationProgress(
  iteration:      PrintableIteration,
  maxIterations:  number,
  newDescription: string | null
): void {
  const trainPct   = isNaN(iteration.trainAccuracy) ? 0 : Math.round(iteration.trainAccuracy * 100)
  const trainPass  = iteration.trainResults.filter(r => r.passed).length
  const trainTotal = iteration.trainResults.length

  const phaseTag = iteration.phase ? ` [${iteration.phase}]` : ''
  let line = `Iteration ${iteration.iteration}/${maxIterations}${phaseTag} — train: ${trainPct}% (${trainPass}/${trainTotal})`

  if (iteration.testAccuracy !== null && !isNaN(iteration.testAccuracy)) {
    const testPct   = Math.round(iteration.testAccuracy * 100)
    const testPass  = iteration.testResults.filter(r => r.passed).length
    const testTotal = iteration.testResults.length
    line += `, test: ${testPct}% (${testPass}/${testTotal})`
  }

  process.stderr.write(line + '\n')

  for (const r of iteration.trainResults.filter(r => !r.passed)) {
    const direction = r.expected ? 'should trigger' : 'should NOT trigger'
    process.stderr.write(`  FAIL (${direction}): "${r.testName}"\n`)
  }

  if (newDescription !== null) {
    process.stderr.write(`  New description: ${newDescription}\n`)
  }
}

export function printFinalSummary(
  iterations:      PrintableIteration[],
  best:            PrintableIteration,
  bestDescription: string
): void {
  const bestTrainPct = isNaN(best.trainAccuracy) ? 0 : Math.round(best.trainAccuracy * 100)
  process.stderr.write(`\nBest iteration: ${best.iteration} (train: ${bestTrainPct}%)\n\n`)

  const hasTest = iterations.some(i => i.testAccuracy !== null)

  // Header
  const header = hasTest
    ? 'Iteration  Phase       Train   Test'
    : 'Iteration  Phase       Train'
  process.stderr.write(header + '\n')
  process.stderr.write('-'.repeat(header.length) + '\n')

  for (const iter of iterations) {
    const phaseCol = (iter.phase ?? '—').padEnd(12)
    const trainPct = (isNaN(iter.trainAccuracy) ? 0 : Math.round(iter.trainAccuracy * 100)) + '%'
    const marker   = iter.iteration === best.iteration ? '  ← best' : ''
    let row = `${String(iter.iteration).padEnd(11)}${phaseCol}${trainPct.padEnd(8)}`
    if (hasTest) {
      const testPct = iter.testAccuracy !== null && !isNaN(iter.testAccuracy) ? Math.round(iter.testAccuracy * 100) + '%' : '—'
      row += testPct.padEnd(6)
    }
    process.stderr.write(row + marker + '\n')
  }

  const allSameScore = iterations.length > 1 && iterations.every(i => i.trainAccuracy === iterations[0].trainAccuracy)
  if (allSameScore) {
    process.stderr.write('\nNote: All iterations produced the same accuracy — description changes had no measurable effect.\n')
  }

  process.stderr.write(`\nBest description:\n${bestDescription}\n`)
}
