import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface AcilHistoryRow {
  test_run_id:         string
  agent_file:          string
  iteration_count:     number
  best_train_accuracy: number
}

export function AcilHistory(): JSX.Element {
  const [runs, setRuns] = useState<AcilHistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/acil')
      .then(res => res.json())
      .then(data => {
        setRuns(data.runs)
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#4f4f4f]">Loading...</div>
  )
  if (error) return (
    <div className="mx-10 mt-8 p-4 bg-[#1f1000] border border-[#d63c00] rounded-lg text-[#d63c00]">{error}</div>
  )
  if (!runs || runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-[#4f4f4f]">
        No ACIL runs found. Run ACIL with: harness acil --suite &lt;name&gt;
      </div>
    )
  }

  const totalRuns = runs.length
  const uniqueAgents = new Set(runs.map(r => r.agent_file)).size
  const avgBestAccuracy = Math.round(
    runs.reduce((s, r) => s + r.best_train_accuracy * 100, 0) / runs.length
  )

  return (
    <div className="px-10 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-[#f0f0f0] text-[35px] font-bold leading-tight"
          style={{ letterSpacing: '-0.5px' }}
        >
          ACIL History
        </h1>
        <p className="text-[#4f4f4f] text-[18px] mt-1.5">
          Track agent description improvement loop runs and accuracy
        </p>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-3 bg-[#1a1b1a] rounded-lg h-20 px-6 w-[220px]">
          <span className="text-[#75fe04] text-[40px] font-bold">{totalRuns}</span>
          <span className="text-[#4f4f4f] text-[16px] w-20 leading-tight">Total Runs</span>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1b1a] rounded-lg h-20 px-6 w-[220px]">
          <span className="text-[#f0f0f0] text-[40px] font-bold">{uniqueAgents}</span>
          <span className="text-[#4f4f4f] text-[16px] w-20 leading-tight">Unique Agents</span>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1b1a] rounded-lg h-20 px-6 w-[220px]">
          <span className="text-[#a580f9] text-[40px] font-bold">{avgBestAccuracy}%</span>
          <span className="text-[#4f4f4f] text-[16px] w-24 leading-tight">Avg Best Accuracy</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#1a1b1a] h-11 border-b border-[#252625]">
              <th className="text-[#4f4f4f] text-[14px] font-bold w-[340px] px-5 py-0 text-left" style={{ letterSpacing: '1.5px' }}>RUN ID</th>
              <th className="text-[#4f4f4f] text-[14px] font-bold w-[400px] px-5 py-0 text-left" style={{ letterSpacing: '1.5px' }}>AGENT</th>
              <th className="text-[#4f4f4f] text-[14px] font-bold w-[200px] px-5 py-0 text-left" style={{ letterSpacing: '1.5px' }}>BEST ACCURACY</th>
              <th className="text-[#4f4f4f] text-[14px] font-bold px-5 py-0 text-left" style={{ letterSpacing: '1.5px' }}>ITERATIONS</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const accuracy = Math.round(run.best_train_accuracy * 100)
              return (
                <tr
                  key={`${run.test_run_id}-${run.agent_file}`}
                  className={`h-14 ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'} ${i < runs.length - 1 ? 'border-b border-[#1f201f]' : ''}`}
                >
                  <td className="px-5">
                    <Link
                      to={`/acil/${run.test_run_id}`}
                      className="text-[#75fe04] text-[16px] font-semibold"
                      style={{ letterSpacing: '0.5px' }}
                    >
                      {run.test_run_id}
                    </Link>
                  </td>
                  <td className="text-[#c5c5c5] text-[16px] px-5">{run.agent_file}</td>
                  <td className="px-5">
                    <span
                      className="text-[16px] font-semibold"
                      style={{ color: accuracy >= 80 ? '#75fe04' : '#a580f9' }}
                    >
                      {accuracy}%
                    </span>
                  </td>
                  <td className="text-[#f0f0f0] text-[16px] font-semibold px-5">{run.iteration_count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="bg-[#1a1b1a] h-px" />
      </div>
    </div>
  )
}
