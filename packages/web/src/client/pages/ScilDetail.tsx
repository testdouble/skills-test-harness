import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface ScilTrainResult {
  testName:  string
  skillFile: string
  expected:  boolean
  actual:    boolean
  passed:    boolean
  runIndex:  number
}

interface ScilIterationRow {
  test_run_id:   string
  iteration:     number
  phase:         string | null
  skill_file:    string
  description:   string
  trainResults:  ScilTrainResult[]
  testResults:   ScilTrainResult[]
  trainAccuracy: number
  testAccuracy:  number | null
}

interface ScilSummaryRow {
  test_run_id:         string
  originalDescription: string
  bestIteration:       number
  bestDescription:     string
}

interface ScilRunDetails {
  summary:    ScilSummaryRow
  iterations: ScilIterationRow[]
}

function SectionHeader({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-3 h-10">
      <span
        className="w-[3px] h-5 rounded-sm flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span
        className="text-[#f0f0f0] text-[20px] font-bold"
        style={{ letterSpacing: '0.2px' }}
      >
        {label}
      </span>
    </div>
  )
}

function AccuracyBadge({ label, value, variant }: { label: string; value: number | null; variant: 'train' | 'test' }) {
  if (value === null) return null
  const pct = Math.round(value * 100)
  const bg = variant === 'train' ? '#0d1a0d' : '#1e1060'
  const color = variant === 'train' ? '#75fe04' : '#a580f9'
  return (
    <span
      className="text-[14px] font-semibold px-2.5 py-1 rounded"
      style={{ backgroundColor: bg, color }}
    >
      {label}: {pct}%
    </span>
  )
}

const phaseColors: Record<string, { bg: string; color: string }> = {
  explore:    { bg: '#0c1929', color: '#60a5fa' },
  transition: { bg: '#1f1a00', color: '#fbbf24' },
  converge:   { bg: '#0a1f0a', color: '#4ade80' },
}

function PhaseBadge({ phase }: { phase: string | null }) {
  if (!phase) return null
  const style = phaseColors[phase]
  if (!style) return null
  return (
    <span
      className="text-[12px] font-bold px-2.5 py-1 rounded"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {phase}
    </span>
  )
}

function TrainResultsTable({ results }: { results: ScilTrainResult[] }) {
  if (results.length === 0) return null
  return (
    <div className="rounded-lg overflow-hidden mt-3">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#1a1b1a] h-[36px] border-b border-[#252625]">
            <th className="text-[#4f4f4f] text-[12px] font-bold w-[400px] px-4 py-0 text-left" style={{ letterSpacing: '1.5px' }}>TEST NAME</th>
            <th className="text-[#4f4f4f] text-[12px] font-bold w-[200px] px-4 py-0 text-left" style={{ letterSpacing: '1.5px' }}>EXPECTED</th>
            <th className="text-[#4f4f4f] text-[12px] font-bold w-[200px] px-4 py-0 text-left" style={{ letterSpacing: '1.5px' }}>ACTUAL</th>
            <th className="text-[#4f4f4f] text-[12px] font-bold px-4 py-0 text-left" style={{ letterSpacing: '1.5px' }}>PASSED</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr
              key={`${r.testName}-${r.runIndex}`}
              className={`h-10 ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'} ${i < results.length - 1 ? 'border-b border-[#1f201f]' : ''}`}
            >
              <td className="px-4">
                <div className="text-[#f0f0f0] text-[14px] truncate">{r.testName}</div>
              </td>
              <td className="text-[#c5c5c5] text-[14px] px-4">{r.expected ? 'trigger' : 'no trigger'}</td>
              <td className="text-[#c5c5c5] text-[14px] px-4">{r.actual ? 'trigger' : 'no trigger'}</td>
              <td className={`text-[18px] font-bold px-4 ${r.passed ? 'text-[#75fe04]' : 'text-[#d63c00]'}`}>
                {r.passed ? '\u2713' : '\u2717'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-px bg-[#1a1b1a]" />
    </div>
  )
}

export function ScilDetail(): JSX.Element {
  const { runId } = useParams<{ runId: string }>()
  const [details, setDetails] = useState<ScilRunDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/scil/${runId}`)
        let data: { error?: string; summary?: ScilSummaryRow; iterations?: ScilIterationRow[] }
        if (!res.ok) {
          data = await res.json().catch(() => ({ error: res.statusText || `HTTP ${res.status}` }))
        } else {
          data = await res.json()
        }
        if (data.error) {
          setError(data.error)
        } else if (!data.summary || !data.iterations) {
          setError('Invalid response from server')
        } else {
          setDetails(data as ScilRunDetails)
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [runId])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#4f4f4f]">Loading...</div>
  )
  if (error) return (
    <div className="px-10 py-8">
      <Link
        to="/scil"
        className="flex items-center gap-2 text-[#4f4f4f] text-[18px] mb-4 hover:text-[#f0f0f0]"
      >
        <span>&larr;</span>
        <span>Back to SCIL History</span>
      </Link>
      <div className="p-4 bg-[#1f1000] border border-[#d63c00] rounded-lg text-[#d63c00]">{error}</div>
    </div>
  )

  const { summary, iterations } = details!

  return (
    <div className="px-10 py-8">
      {/* Back link */}
      <Link
        to="/scil"
        className="flex items-center gap-2 text-[#4f4f4f] mb-6 w-fit hover:text-[#f0f0f0]"
      >
        <span className="text-[20px]">&larr;</span>
        <span className="text-[16px]">Back to SCIL History</span>
      </Link>

      {/* Run header */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-[#4f4f4f] text-[16px] font-medium">SCIL Run</span>
        <span
          className="text-[#f0f0f0] text-[28px] font-bold"
          style={{ letterSpacing: '0.5px' }}
        >
          {runId}
        </span>
      </div>

      {/* Original Description */}
      <div className="mb-6">
        <div className="mb-3">
          <SectionHeader color="#a580f9" label="Original Description" />
        </div>
        <div className="bg-[#1a1b1a] rounded-lg p-6">
          <p className="text-[#c5c5c5] text-[15px] leading-relaxed whitespace-pre-wrap">
            {summary.originalDescription}
          </p>
        </div>
      </div>

      <div className="h-px bg-[#252625] mb-6" />

      {/* Iterations */}
      <div className="mb-6">
        <div className="mb-3">
          <SectionHeader color="#75fe04" label="Iterations" />
        </div>
        {iterations.map((iter) => {
          const isBest = iter.iteration === summary.bestIteration
          return (
            <div key={iter.iteration} className="mb-5">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-[#f0f0f0] text-[18px] font-bold">
                  Iteration {iter.iteration}
                </span>
                {isBest && (
                  <span className="text-[#75fe04] text-[12px] font-bold px-2.5 py-1 rounded border border-[#75fe04] bg-[#1a3a0a]">
                    Best
                  </span>
                )}
                <PhaseBadge phase={iter.phase} />
                <AccuracyBadge label="Train" value={iter.trainAccuracy} variant="train" />
                <AccuracyBadge label="Test" value={iter.testAccuracy} variant="test" />
              </div>
              <p className="text-[#c5c5c5] text-[14px] leading-relaxed whitespace-pre-wrap mb-3">
                {iter.description}
              </p>
              <TrainResultsTable results={iter.trainResults} />
            </div>
          )
        })}
      </div>

      {/* Best Description */}
      <div className="mb-6">
        <div className="flex items-center gap-3 h-10 mb-3">
          <span className="w-[3px] h-5 rounded-sm flex-shrink-0 bg-[#75fe04]" />
          <span className="text-[#f0f0f0] text-[20px] font-bold" style={{ letterSpacing: '0.2px' }}>
            Best Description
          </span>
          <span className="text-[#75fe04] text-[16px] font-semibold">
            Iteration {summary.bestIteration}
          </span>
        </div>
        <div className="bg-[#1a1b1a] border-2 border-[#75fe04] rounded-lg p-6">
          <p className="text-[#c5c5c5] text-[15px] leading-relaxed whitespace-pre-wrap">
            {summary.bestDescription}
          </p>
        </div>
      </div>
    </div>
  )
}
