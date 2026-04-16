import { useEffect, useState, Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { marked } from 'marked'

interface TestRunDetailRow {
  test_run_id:             string
  test_name:               string
  suite:                   string
  is_error:                boolean
  all_expectations_passed: boolean
  total_cost_usd:          number
  num_turns:               number
  input_tokens:            number
  output_tokens:           number
}

interface TestRunExpectationRow {
  test_run_id:  string
  suite:        string
  test_name:    string
  expect_type:  string
  expect_value: string
  passed:       boolean
}

interface LlmJudgeCriterion {
  criterion:   string
  passed:      boolean
  confidence?: "partial" | "full"
  reasoning?:  string
}

interface LlmJudgeGroup {
  testName:    string
  rubricFile:  string
  model:       string
  threshold:   number
  score:       number
  passed:      boolean
  resultText?: string
  criteria:    LlmJudgeCriterion[]
}

interface OutputFileRow {
  testName:    string
  filePath:    string
  fileContent: string
}

interface Details {
  summary:         TestRunDetailRow[]
  expectations:    TestRunExpectationRow[]
  llmJudgeGroups:  LlmJudgeGroup[]
  outputFiles:     OutputFileRow[]
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

function SuiteBadge({ suite }: { suite: string }) {
  return (
    <span className="bg-[#1e1060] text-[#a580f9] text-[16px] font-semibold px-3.5 py-1.5 rounded-md">
      {suite}
    </span>
  )
}

function CollapsibleOutput({ resultText }: { resultText?: string }) {
  const [expanded, setExpanded] = useState(false)

  if (!resultText) return null

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full h-11 px-5 bg-[#1a1b1a] border border-[#2a2b2a] cursor-pointer text-left"
        style={{ borderRadius: expanded ? '8px 8px 0 0' : '8px' }}
      >
        <span className="text-[#a580f9] text-[14px] font-bold">{expanded ? '▼' : '▶'}</span>
        <span className="text-[#f0f0f0] text-[14px] font-semibold">Full Output</span>
        <span className="flex-1" />
        <span className="text-[#4f4f4f] text-[12px] italic">click to {expanded ? 'collapse' : 'expand'}</span>
      </button>
      {expanded && (
        <div
          className="markdown-content bg-[#161716] px-7 py-6 border-x border-b border-[#2a2b2a]"
          style={{ borderRadius: '0 0 8px 8px' }}
          dangerouslySetInnerHTML={{ __html: marked(resultText) as string }}
        />
      )}
    </div>
  )
}

function CriteriaTable({ criteria }: { criteria: LlmJudgeCriterion[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleRow = (index: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="rounded-lg overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#1a1b1a]">
            <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>CRITERION</th>
            <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 w-[80px] border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>RESULT</th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((cr, i) => (
            <Fragment key={i}>
              <tr
                className={`h-12 cursor-pointer hover:brightness-110 ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'} ${i < criteria.length - 1 && !expandedRows.has(i) ? 'border-b border-[#1f201f]' : ''}`}
                onClick={() => cr.reasoning ? toggleRow(i) : undefined}
              >
                <td className="text-[#c5c5c5] text-[14px] px-5 pr-4">{cr.criterion}</td>
                <td className={`text-[20px] font-bold px-5 w-[80px] ${
                  cr.passed && cr.confidence === 'partial'
                    ? 'text-[#f97316]'
                    : cr.passed
                      ? 'text-[#75fe04]'
                      : 'text-[#d63c00]'
                }`}>
                  {cr.passed && cr.confidence === 'partial' ? '½' : cr.passed ? '✓' : '✗'}
                </td>
              </tr>
              {expandedRows.has(i) && cr.reasoning && (
                <tr className={i < criteria.length - 1 ? 'border-b border-[#1f201f]' : ''}>
                  <td colSpan={2} className="bg-[#1a1b1a] border-l-2 border-[#a580f9] px-6 py-4">
                    <span className="text-[#4f4f4f] text-[12px] font-semibold uppercase tracking-wider">Reasoning</span>
                    <p className="text-[#c5c5c5] text-[13px] mt-1 leading-relaxed">{cr.reasoning}</p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CollapsibleOutputFile({ file }: { file: OutputFileRow }) {
  const [expanded, setExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full h-11 px-5 bg-[#1a1b1a] border border-[#2a2b2a] cursor-pointer text-left"
        style={{ borderRadius: expanded ? '8px 8px 0 0' : '8px' }}
      >
        <span className="text-[#a580f9] text-[14px] font-bold">{expanded ? '▼' : '▶'}</span>
        <span className="text-[#f0f0f0] text-[14px] font-semibold">{file.filePath}</span>
        <span className="flex-1" />
        <span className="text-[#4f4f4f] text-[12px] italic">click to {expanded ? 'collapse' : 'expand'}</span>
      </button>
      {expanded && (
        <div
          className="bg-[#161716] border-x border-b border-[#2a2b2a]"
          style={{ borderRadius: '0 0 8px 8px' }}
        >
          <div className="flex gap-2 px-5 pt-3">
            <button
              onClick={() => setViewMode('rendered')}
              className={`text-[12px] px-2.5 py-1 rounded ${viewMode === 'rendered' ? 'bg-[#a580f9] text-[#0d0d0d]' : 'bg-[#252625] text-[#4f4f4f]'}`}
            >
              Rendered
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`text-[12px] px-2.5 py-1 rounded ${viewMode === 'raw' ? 'bg-[#a580f9] text-[#0d0d0d]' : 'bg-[#252625] text-[#4f4f4f]'}`}
            >
              Raw
            </button>
          </div>
          {viewMode === 'rendered' ? (
            <div
              className="markdown-content px-7 py-6"
              dangerouslySetInnerHTML={{ __html: marked(file.fileContent) as string }}
            />
          ) : (
            <pre className="px-7 py-6 text-[#c5c5c5] text-[13px] whitespace-pre-wrap overflow-x-auto">{file.fileContent}</pre>
          )}
        </div>
      )}
    </div>
  )
}

function OutputFilesSection({ files, testName }: { files: OutputFileRow[]; testName: string }) {
  const testFiles = files.filter(f => f.testName === testName)
  if (testFiles.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      {testFiles.map((file, i) => (
        <CollapsibleOutputFile key={`${file.filePath}-${i}`} file={file} />
      ))}
    </div>
  )
}

function LlmJudgeSection({ group }: { group: LlmJudgeGroup }) {
  return (
    <div className="mb-8">
      {/* Rubric metadata card */}
      <div className="flex items-center gap-5 h-11 px-5 rounded-lg bg-[#1a1b1a] border border-[#2a2b2a] mb-3">
        <span className="text-[#4f4f4f] text-[13px] font-bold tracking-wide">Rubric:</span>
        <span className="text-[#a580f9] text-[14px] font-semibold">{group.rubricFile}</span>
        <span className="flex-1" />
        <span className="text-[#4f4f4f] text-[13px] font-semibold">Model:</span>
        <span className="text-[#c5c5c5] text-[14px] font-medium">{group.model}</span>
        <span className="text-[#4f4f4f] text-[13px] font-semibold">Threshold:</span>
        <span className="text-[#c5c5c5] text-[14px] font-medium">{group.threshold.toFixed(2)}</span>
        <span className="text-[#4f4f4f] text-[13px] font-semibold">Score:</span>
        <span className={`text-[14px] font-bold ${group.passed ? 'text-[#75fe04]' : 'text-[#d63c00]'}`}>
          {group.score.toFixed(2)} {group.passed ? '✓' : '✗'}
        </span>
      </div>

      {/* Collapsible full output */}
      <div className="mb-3">
        <CollapsibleOutput resultText={group.resultText} />
      </div>

      {/* Criteria table */}
      <CriteriaTable criteria={group.criteria} />
    </div>
  )
}

export function TestRunDetail(): JSX.Element {
  const { runId } = useParams<{ runId: string }>()
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/test-runs/${runId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setDetails(data)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [runId])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#4f4f4f]">Loading...</div>
  )
  if (error) return (
    <div className="px-10 py-8">
      <Link to="/" className="flex items-center gap-2 text-[#4f4f4f] text-[18px] mb-4 hover:text-[#f0f0f0]">
        <span>←</span>
        <span>Back to History</span>
      </Link>
      <div className="p-4 bg-[#1f1000] border border-[#d63c00] rounded-lg text-[#d63c00]">{error}</div>
    </div>
  )

  const suite = details?.summary[0]?.suite ?? ''
  const failureCount = details?.summary.filter(r => !r.all_expectations_passed || r.is_error).length ?? 0
  const allPassed = failureCount === 0

  return (
    <div className="px-10 py-8">
      {/* Back link */}
      <Link
        to="/"
        className="flex items-center gap-2 text-[#4f4f4f] text-[18px] mb-6 w-fit hover:text-[#f0f0f0]"
      >
        <span className="text-[20px]">←</span>
        <span>Back to History</span>
      </Link>

      {/* Run header */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-[#4f4f4f] text-[16px] font-medium">Test Run</span>
        <span
          className="text-[#f0f0f0] text-[28px] font-bold"
          style={{ letterSpacing: '0.5px' }}
        >
          {runId}
        </span>
        {suite && <SuiteBadge suite={suite} />}
        <div className="flex-1" />
        {!allPassed && (
          <div
            className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#d63c00] bg-[#1f1000]"
          >
            <span className="text-[#d63c00] text-[16px] font-bold">✗</span>
            <span className="text-[#d63c00] text-[16px] font-semibold">{failureCount} {failureCount === 1 ? 'Failure' : 'Failures'}</span>
          </div>
        )}
        {allPassed && (
          <div
            className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#75fe04] bg-[#0d1a0d]"
          >
            <span className="text-[#75fe04] text-[16px] font-bold">✓</span>
            <span className="text-[#75fe04] text-[16px] font-semibold">All Passed</span>
          </div>
        )}
      </div>

      <div className="h-px bg-[#252625] mb-6" />

      {/* Test Summary */}
      <div className="mb-6">
        <div className="mb-3">
          <SectionHeader color="#75fe04" label="Test Summary" />
        </div>
        <div className="rounded-lg overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#1a1b1a]">
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>TEST NAME</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 whitespace-nowrap border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>SUITE</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>ERROR</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>ALL PASSED</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>COST (USD)</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>TURNS</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>INPUT TOK</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>OUTPUT TOK</th>
              </tr>
            </thead>
            <tbody>
              {details?.summary.map((row, i) => (
                <tr
                  key={row.test_name}
                  className={`h-[50px] ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'} ${i < (details?.summary.length ?? 0) - 1 ? 'border-b border-[#1f201f]' : ''}`}
                >
                  <td className="text-[#f0f0f0] text-[15px] font-medium px-5 max-w-[280px]">
                    <span className="block truncate">{row.test_name}</span>
                  </td>
                  <td className="px-5 whitespace-nowrap">
                    <span className="bg-[#1e1060] text-[#a580f9] text-[14px] font-semibold px-2 py-0.5 rounded">
                      {row.suite}
                    </span>
                  </td>
                  <td className="text-[#4f4f4f] text-[16px] px-5">
                    {row.is_error ? <span className="text-[#d63c00]">⚠</span> : '—'}
                  </td>
                  <td className={`text-[20px] font-bold px-5 ${row.all_expectations_passed ? 'text-[#75fe04]' : 'text-[#d63c00]'}`}>
                    {row.all_expectations_passed ? '✓' : '✗'}
                  </td>
                  <td className="text-[#c5c5c5] text-[15px] px-5">
                    ${row.total_cost_usd.toFixed(3)}
                  </td>
                  <td className="text-[#c5c5c5] text-[15px] px-5">{row.num_turns}</td>
                  <td className="text-[#c5c5c5] text-[15px] px-5">{row.input_tokens.toLocaleString()}</td>
                  <td className="text-[#4f4f4f] text-[15px] px-5">
                    {row.output_tokens ? row.output_tokens.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expectation Results */}
      <div className="mb-6">
        <div className="mb-3">
          <SectionHeader color="#4d0aed" label="Expectation Results" />
        </div>
        <div className="rounded-lg overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#1a1b1a]">
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>TEST NAME</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>TYPE</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>EXPECTED VALUE</th>
                <th className="text-[#4f4f4f] text-[13px] font-bold text-left px-5 h-10 w-[100px] border-b border-[#252625]" style={{ letterSpacing: '1.5px' }}>RESULT</th>
              </tr>
            </thead>
            <tbody>
              {details?.expectations.map((row, i) => (
                <tr
                  key={i}
                  className={`h-12 ${i % 2 === 0 ? 'bg-[#161716]' : 'bg-[#131413]'} ${i < (details?.expectations.length ?? 0) - 1 ? 'border-b border-[#1f201f]' : ''}`}
                >
                  <td className="text-[#f0f0f0] text-[15px] px-5 max-w-[300px]">
                    <span className="block truncate">{row.test_name}</span>
                  </td>
                  <td className="px-5">
                    <span
                      className="text-[14px] font-semibold px-2.5 py-0.5 rounded"
                      style={{
                        backgroundColor: row.expect_type === 'has_call' ? '#0d1a0d' : '#0d0d1a',
                        color: row.expect_type === 'has_call' ? '#75fe04' : '#a580f9',
                      }}
                    >
                      {row.expect_type}
                    </span>
                  </td>
                  <td className="text-[#c5c5c5] text-[15px] px-5">
                    <span className="block truncate pr-4">{row.expect_value}</span>
                  </td>
                  <td className={`text-[20px] font-bold px-5 w-[100px] ${row.passed ? 'text-[#75fe04]' : 'text-[#d63c00]'}`}>
                    {row.passed ? '✓' : '✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LLM Judge Results */}
      {details?.llmJudgeGroups && details.llmJudgeGroups.length > 0 && (
        <div>
          <div className="mb-3">
            <SectionHeader color="#4d0aed" label="LLM Judge Results" />
          </div>
          {details.llmJudgeGroups.map((group, i) => (
            <div key={`${group.testName}-${group.rubricFile}-${i}`}>
              <LlmJudgeSection group={group} />
              {details.outputFiles && (
                <OutputFilesSection files={details.outputFiles} testName={group.testName} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Output Files (for tests without LLM judge) */}
      {details?.outputFiles && details.outputFiles.length > 0 && (
        (() => {
          const judgeTestNames = new Set(details.llmJudgeGroups?.map(g => g.testName) ?? [])
          const nonJudgeFiles = details.outputFiles.filter(f => !judgeTestNames.has(f.testName))
          if (nonJudgeFiles.length === 0) return null
          const groupedByTest = new Map<string, OutputFileRow[]>()
          for (const f of nonJudgeFiles) {
            const existing = groupedByTest.get(f.testName) ?? []
            existing.push(f)
            groupedByTest.set(f.testName, existing)
          }
          return (
            <div className="mb-6">
              <div className="mb-3">
                <SectionHeader color="#4d0aed" label="Output Files" />
              </div>
              {Array.from(groupedByTest.entries()).map(([testName, files]) => (
                <div key={testName} className="mb-4">
                  <span className="text-[#c5c5c5] text-[14px] font-semibold mb-2 block">{testName}</span>
                  <div className="space-y-2">
                    {files.map((file, i) => (
                      <CollapsibleOutputFile key={`${file.filePath}-${i}`} file={file} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      )}
    </div>
  )
}
