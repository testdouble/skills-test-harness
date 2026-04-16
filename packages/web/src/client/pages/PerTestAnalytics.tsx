import { useEffect, useState } from 'react'

interface PerTestRow {
  test_run_id: string
  test_name: string
  suite: string
  all_expectations_passed: boolean
  total_cost_usd: number
  num_turns: number
  input_tokens: number
  output_tokens: number
}

interface SuiteStats {
  suite: string
  runs: number
  tests: number
  passed: number
}

interface TestCost {
  test_name: string
  total_cost: number
}

function DonutChart({ passCount, failCount }: { passCount: number; failCount: number }) {
  const total = passCount + failCount
  const passPercent = total > 0 ? Math.round((passCount / total) * 100) : 0
  const passDeg = (passPercent / 100) * 360

  return (
    <div className="flex flex-col gap-4">
      <span className="text-[#4f4f4f] text-[13px] font-bold" style={{ letterSpacing: '1.5px' }}>
        PASS / FAIL RATE
      </span>
      <div className="flex justify-center">
        <div className="relative w-40 h-40">
          {/* Donut via conic-gradient */}
          <div
            className="w-40 h-40 rounded-full"
            style={{
              background: `conic-gradient(#75fe04 0deg ${passDeg}deg, #d63c00 ${passDeg}deg 360deg)`,
            }}
          />
          {/* Hole */}
          <div
            className="absolute bg-[#1a1b1a] rounded-full flex items-center justify-center"
            style={{ top: '19%', left: '19%', width: '62%', height: '62%' }}
          >
            <span className="text-[#f0f0f0] text-[25px] font-bold">{passPercent}%</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#75fe04] flex-shrink-0" />
          <span className="text-[#4f4f4f] text-[15px]">Passed {passCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d63c00] flex-shrink-0" />
          <span className="text-[#4f4f4f] text-[15px]">Failed {failCount}</span>
        </div>
      </div>
    </div>
  )
}

export function PerTestAnalytics(): JSX.Element {
  const [allRows, setAllRows] = useState<PerTestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analytics/per-test')
      .then((res) => res.json())
      .then((data) => {
        setAllRows(data.rows)
        setLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-[#4f4f4f]">Loading...</div>
  if (error)
    return <div className="mx-10 mt-8 p-4 bg-[#1f1000] border border-[#d63c00] rounded-lg text-[#d63c00]">{error}</div>

  // Aggregate stats
  const totalRuns = new Set(allRows.map((r) => r.test_run_id)).size
  const totalTests = allRows.length
  const passedTests = allRows.filter((r) => r.all_expectations_passed).length
  const failedTests = totalTests - passedTests
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0
  const totalCost = allRows.reduce((s, r) => s + r.total_cost_usd, 0)
  const avgTurns = totalTests > 0 ? allRows.reduce((s, r) => s + r.num_turns, 0) / totalTests : 0

  // Suite breakdown
  const suiteMap = new Map<string, SuiteStats>()
  for (const row of allRows) {
    const existing = suiteMap.get(row.suite) ?? { suite: row.suite, runs: 0, tests: 0, passed: 0 }
    existing.tests++
    if (row.all_expectations_passed) existing.passed++
    suiteMap.set(row.suite, existing)
  }
  // Runs per suite (unique run IDs per suite)
  const suiteRunMap = new Map<string, Set<string>>()
  for (const row of allRows) {
    if (!suiteRunMap.has(row.suite)) suiteRunMap.set(row.suite, new Set())
    suiteRunMap.get(row.suite)?.add(row.test_run_id)
  }
  const suiteStats: SuiteStats[] = Array.from(suiteMap.values()).map((s) => ({
    ...s,
    runs: suiteRunMap.get(s.suite)?.size ?? 0,
  }))

  // Cost by test name (top 3)
  const costByTest = new Map<string, number>()
  for (const row of allRows) {
    costByTest.set(row.test_name, (costByTest.get(row.test_name) ?? 0) + row.total_cost_usd)
  }
  const topCosts: TestCost[] = Array.from(costByTest.entries())
    .map(([test_name, total_cost]) => ({ test_name, total_cost }))
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, 3)
  const maxCost = topCosts[0]?.total_cost ?? 1

  return (
    <div className="px-10 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-[#f0f0f0] text-[35px] font-bold leading-tight" style={{ letterSpacing: '-0.5px' }}>
          Analytics
        </h1>
        <p className="text-[#4f4f4f] text-[18px] mt-1">Aggregate insights across all test suites and runs</p>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-6">
        {[
          { label: 'TOTAL RUNS', value: String(totalRuns), color: '#75fe04' },
          { label: 'TOTAL TESTS', value: String(totalTests), color: '#f0f0f0' },
          { label: 'PASS RATE', value: `${passRate}%`, color: '#a580f9' },
          { label: 'TOTAL COST', value: `$${totalCost.toFixed(3)}`, color: '#f0f0f0' },
          { label: 'AVG TURNS', value: avgTurns.toFixed(1), color: '#f0f0f0' },
        ].map((stat) => (
          <div key={stat.label} className="flex-1 flex flex-col gap-1 bg-[#1a1b1a] rounded-lg p-5">
            <span className="text-[#4f4f4f] text-[13px] font-bold" style={{ letterSpacing: '1.5px' }}>
              {stat.label}
            </span>
            <span className="text-[38px] font-bold" style={{ color: stat.color }}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="flex gap-4 mb-4">
        {/* Donut card */}
        <div className="bg-[#1a1b1a] rounded-lg p-6 w-[380px] flex-shrink-0">
          <DonutChart passCount={passedTests} failCount={failedTests} />
        </div>

        {/* Suite breakdown */}
        <div className="flex-1 bg-[#1a1b1a] rounded-lg p-6">
          <span className="text-[#4f4f4f] text-[13px] font-bold block mb-4" style={{ letterSpacing: '1.5px' }}>
            SUITE BREAKDOWN
          </span>
          <div className="rounded-md overflow-hidden">
            <div className="bg-[#131413] flex items-center h-9 px-4 rounded-md">
              <span className="text-[#4f4f4f] text-[13px] font-bold flex-1" style={{ letterSpacing: '1.2px' }}>
                SUITE
              </span>
              <span className="text-[#4f4f4f] text-[13px] font-bold w-20" style={{ letterSpacing: '1.2px' }}>
                RUNS
              </span>
              <span className="text-[#4f4f4f] text-[13px] font-bold w-20" style={{ letterSpacing: '1.2px' }}>
                TESTS
              </span>
              <span className="text-[#4f4f4f] text-[13px] font-bold w-32" style={{ letterSpacing: '1.2px' }}>
                PASS RATE
              </span>
            </div>
            {suiteStats.map((s, i) => {
              const suitePassRate = s.tests > 0 ? Math.round((s.passed / s.tests) * 100) : 0
              return (
                <div
                  key={s.suite}
                  className={`flex items-center h-12 px-4 rounded-md mt-0.5 ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'}`}
                >
                  <span className="flex-1">
                    <span className="bg-[#1e1060] text-[#a580f9] text-[15px] font-semibold px-2.5 py-1 rounded">
                      {s.suite}
                    </span>
                  </span>
                  <span className="text-[#f0f0f0] text-[16px] font-semibold w-20">{s.runs}</span>
                  <span className="text-[#f0f0f0] text-[16px] font-semibold w-20">{s.tests}</span>
                  <span className="w-32 flex items-center gap-2">
                    <span className="relative bg-[#252625] rounded-sm h-1.5 w-20 overflow-hidden">
                      <span
                        className="absolute left-0 top-0 h-full bg-[#75fe04] rounded-sm"
                        style={{ width: `${suitePassRate}%` }}
                      />
                    </span>
                    <span className="text-[#f0f0f0] text-[15px] font-semibold">{suitePassRate}%</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex gap-4">
        {/* Cost by test */}
        <div className="flex-1 bg-[#1a1b1a] rounded-lg p-6">
          <span className="text-[#4f4f4f] text-[13px] font-bold block mb-4" style={{ letterSpacing: '1.5px' }}>
            COST BY TEST
          </span>
          <div className="flex flex-col gap-2.5">
            {topCosts.map((tc) => {
              const barWidth = maxCost > 0 ? (tc.total_cost / maxCost) * 100 : 0
              const barColor = barWidth > 66 ? '#4d0aed' : barWidth > 33 ? '#a580f9' : '#75fe04'
              return (
                <div key={tc.test_name} className="flex items-center gap-3 h-7">
                  <span className="text-[#c5c5c5] text-[15px] w-48 truncate flex-shrink-0">{tc.test_name}</span>
                  <div className="relative flex-1 bg-[#252625] rounded-sm h-1.5 overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full rounded-sm"
                      style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span className="text-[#c5c5c5] text-[15px] w-16 text-right flex-shrink-0">
                    ${tc.total_cost.toFixed(3)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Expectation types */}
        <div className="w-[400px] flex-shrink-0 bg-[#1a1b1a] rounded-lg p-6">
          <span className="text-[#4f4f4f] text-[13px] font-bold block mb-4" style={{ letterSpacing: '1.5px' }}>
            EXPECTATION TYPES
          </span>
          {allRows.length === 0 ? (
            <span className="text-[#4f4f4f] text-[15px]">No data available</span>
          ) : (
            <div className="flex flex-col gap-2">
              {['has_call', 'not_call', 'no_mention'].map((type, i) => (
                <div
                  key={type}
                  className={`flex items-center gap-2.5 h-9 px-3 rounded-md ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'}`}
                >
                  <span
                    className="text-[14px] font-semibold px-2 py-0.5 rounded flex-1"
                    style={{
                      backgroundColor: type === 'has_call' ? '#0d1a0d' : '#0d0d1a',
                      color: type === 'has_call' ? '#75fe04' : '#a580f9',
                    }}
                  >
                    {type}
                  </span>
                  <span className="text-[#4f4f4f] text-[15px]">—</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
