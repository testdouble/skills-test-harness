import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface TestRunSummary {
  test_run_id: string
  suite: string
  date: string
  total_tests: number
  passed: number
  failed: number
}

export function TestRunHistory(): JSX.Element {
  const [runs, setRuns] = useState<TestRunSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/test-runs')
      .then((res) => res.json())
      .then((data) => {
        setRuns(data.runs)
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
  if (!runs || runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-[#4f4f4f]">
        No test runs found. Run tests with: harness run-test --suite &lt;name&gt;
      </div>
    )
  }

  const totalRuns = runs.length
  const totalTests = runs.reduce((s, r) => s + r.total_tests, 0)
  const avgPassRate = Math.round(runs.reduce((s, r) => s + (r.passed / r.total_tests) * 100, 0) / runs.length)

  return (
    <div className="px-10 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-[#f0f0f0] text-[35px] font-bold leading-tight" style={{ letterSpacing: '-0.5px' }}>
          Test Run History
        </h1>
        <p className="text-[#4f4f4f] text-[18px] mt-1.5">Track and audit Claude skill test runs across all suites</p>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-3 bg-[#1a1b1a] rounded-lg h-20 px-6 w-[220px]">
          <span className="text-[#75fe04] text-[40px] font-bold">{totalRuns}</span>
          <span className="text-[#4f4f4f] text-[16px] w-20 leading-tight">Total Runs</span>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1b1a] rounded-lg h-20 px-6 w-[220px]">
          <span className="text-[#f0f0f0] text-[40px] font-bold">{totalTests}</span>
          <span className="text-[#4f4f4f] text-[16px] w-20 leading-tight">Total Tests</span>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1b1a] rounded-lg h-20 px-6 w-[220px]">
          <span className="text-[#a580f9] text-[40px] font-bold">{avgPassRate}%</span>
          <span className="text-[#4f4f4f] text-[16px] w-24 leading-tight">Avg Pass Rate</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#1a1b1a]">
              <th
                className="text-[#4f4f4f] text-[14px] font-bold text-left px-5 h-11 border-b border-[#252625]"
                style={{ letterSpacing: '1.5px' }}
              >
                RUN ID
              </th>
              <th
                className="text-[#4f4f4f] text-[14px] font-bold text-left px-5 h-11 whitespace-nowrap border-b border-[#252625]"
                style={{ letterSpacing: '1.5px' }}
              >
                SUITE
              </th>
              <th
                className="text-[#4f4f4f] text-[14px] font-bold text-left px-5 h-11 border-b border-[#252625]"
                style={{ letterSpacing: '1.5px' }}
              >
                DATE
              </th>
              <th
                className="text-[#4f4f4f] text-[14px] font-bold text-left px-5 h-11 border-b border-[#252625]"
                style={{ letterSpacing: '1.5px' }}
              >
                TOTAL
              </th>
              <th
                className="text-[#4f4f4f] text-[14px] font-bold text-left px-5 h-11 border-b border-[#252625]"
                style={{ letterSpacing: '1.5px' }}
              >
                PASSED
              </th>
              <th
                className="text-[#4f4f4f] text-[14px] font-bold text-left px-5 h-11 border-b border-[#252625]"
                style={{ letterSpacing: '1.5px' }}
              >
                FAILED
              </th>
              <th
                className="text-[#4f4f4f] text-[14px] font-bold text-left px-5 h-11 border-b border-[#252625]"
                style={{ letterSpacing: '1.5px' }}
              >
                PASS RATE
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const passRate = Math.round((run.passed / run.total_tests) * 100)
              return (
                <tr
                  key={run.test_run_id}
                  className={`h-14 ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'} ${i < runs.length - 1 ? 'border-b border-[#1f201f]' : ''}`}
                >
                  <td className="px-5">
                    <Link
                      to={`/runs/${run.test_run_id}`}
                      className="text-[#75fe04] text-[16px] font-semibold"
                      style={{ letterSpacing: '0.5px' }}
                    >
                      {run.test_run_id}
                    </Link>
                  </td>
                  <td className="px-5 whitespace-nowrap">
                    <span className="bg-[#1e1060] text-[#a580f9] text-[16px] font-semibold px-2.5 py-1 rounded">
                      {run.suite}
                    </span>
                  </td>
                  <td className="text-[#c5c5c5] text-[16px] px-5">{run.date}</td>
                  <td className="text-[#f0f0f0] text-[16px] font-semibold px-5">{run.total_tests}</td>
                  <td className="text-[#75fe04] text-[16px] font-semibold px-5">{run.passed}</td>
                  <td className="text-[#d63c00] text-[16px] font-semibold px-5">{run.failed}</td>
                  <td className="px-5">
                    <span className="flex items-center gap-2.5">
                      <span className="relative bg-[#252625] rounded-sm h-1.5 w-[120px] overflow-hidden">
                        <span
                          className="absolute left-0 top-0 h-full bg-[#75fe04] rounded-sm"
                          style={{ width: `${passRate}%` }}
                        />
                      </span>
                      <span className="text-[#f0f0f0] text-[16px] font-semibold">{passRate}%</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
