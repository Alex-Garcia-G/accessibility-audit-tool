// AuditReport — displays the final accessibility report.
//
// This component is purely presentational — it receives the report data as props
// and renders it. No state, no side effects, no API calls. Just props → UI.
// These are called "dumb components" or "presentational components" in React.

import { Link } from 'react-router-dom'
import type { AuditReport as AuditReportType, Violation } from '../types.js'

interface Props {
  report: AuditReportType
  inputLabel: string // the URL or filename that was audited
}

// Score badge color: green above 80, yellow 50-79, red below 50
function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'border-green-700 bg-green-950'
  if (score >= 50) return 'border-yellow-700 bg-yellow-950'
  return 'border-red-700 bg-red-950'
}

// Severity badge colors
const SEVERITY_STYLES: Record<
  Violation['severity'],
  { badge: string; border: string; bg: string }
> = {
  critical: { badge: 'bg-red-900 text-red-300', border: 'border-red-900', bg: 'bg-red-950' },
  serious: {
    badge: 'bg-orange-900 text-orange-300',
    border: 'border-orange-900',
    bg: 'bg-orange-950',
  },
  moderate: {
    badge: 'bg-yellow-900 text-yellow-300',
    border: 'border-yellow-900',
    bg: 'bg-yellow-950',
  },
  minor: { badge: 'bg-gray-800 text-gray-300', border: 'border-gray-800', bg: 'bg-gray-900' },
}

// Order violations by severity (worst first)
const SEVERITY_ORDER: Violation['severity'][] = ['critical', 'serious', 'moderate', 'minor']

function ViolationCard({ violation }: { violation: Violation }) {
  const styles = SEVERITY_STYLES[violation.severity]

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-5`}>
      {/* Header row: WCAG criterion + severity badge */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="text-gray-400 text-xs font-mono">{violation.wcagCriteria}</span>
          <p className="text-white font-medium mt-1">{violation.description}</p>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 capitalize ${styles.badge}`}
        >
          {violation.severity}
        </span>
      </div>

      {/* Offending element */}
      <div className="mb-3">
        <div className="text-gray-500 text-xs mb-1">Affected element</div>
        <pre className="text-gray-300 text-xs bg-gray-900 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all">
          {violation.element}
        </pre>
      </div>

      {/* Suggestion */}
      <div className="mb-3">
        <div className="text-gray-500 text-xs mb-1">How to fix</div>
        <p className="text-gray-300 text-sm">{violation.suggestion}</p>
      </div>

      {/* Fix example — only present on critical/serious violations */}
      {violation.fixExample && (
        <div>
          <div className="text-gray-500 text-xs mb-1">Fixed code</div>
          <pre className="text-green-300 text-xs bg-gray-900 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all border border-green-900">
            {violation.fixExample}
          </pre>
        </div>
      )}
    </div>
  )
}

export function AuditReport({ report, inputLabel }: Props) {
  const sortedViolations = [...report.violations].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-6">
          <h1 className="text-white font-semibold text-lg">Accessibility Audit Tool</h1>
          <Link to="/new" className="text-gray-400 hover:text-white text-sm transition-colors">
            New Audit
          </Link>
          <Link to="/history" className="text-gray-400 hover:text-white text-sm transition-colors">
            History
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Score + summary */}
        <div className={`rounded-2xl border ${scoreBg(report.score)} p-8 mb-8 text-center`}>
          <div className="text-gray-400 text-sm mb-2 truncate">Audit for: {inputLabel}</div>
          <div className={`text-8xl font-black mb-2 ${scoreColor(report.score)}`}>
            {report.score}
          </div>
          <div className="text-gray-400 text-sm mb-6">out of 100</div>
          <p className="text-gray-200 text-base leading-relaxed max-w-xl mx-auto">
            {report.summary}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {SEVERITY_ORDER.map((sev) => {
            const count = report.violations.filter((v) => v.severity === sev).length
            const styles = SEVERITY_STYLES[sev]
            return (
              <div
                key={sev}
                className={`rounded-xl border ${styles.border} ${styles.bg} px-4 py-4 text-center`}
              >
                <div
                  className={`text-3xl font-bold ${
                    sev === 'critical'
                      ? 'text-red-400'
                      : sev === 'serious'
                        ? 'text-orange-400'
                        : sev === 'moderate'
                          ? 'text-yellow-400'
                          : 'text-gray-400'
                  }`}
                >
                  {count}
                </div>
                <div className="text-gray-500 text-xs capitalize mt-1">{sev}</div>
              </div>
            )
          })}
        </div>

        {/* Violations */}
        {sortedViolations.length > 0 && (
          <section className="mb-8">
            <h2 className="text-white text-xl font-bold mb-4">
              Violations ({sortedViolations.length})
            </h2>
            <div className="space-y-4">
              {sortedViolations.map((violation, i) => (
                <ViolationCard key={i} violation={violation} />
              ))}
            </div>
          </section>
        )}

        {/* Passed checks */}
        {report.passedChecks.length > 0 && (
          <section>
            <h2 className="text-white text-xl font-bold mb-4">
              Passed Checks ({report.passedChecks.length})
            </h2>
            <div className="bg-green-950 border border-green-900 rounded-xl p-5">
              <ul className="space-y-2">
                {report.passedChecks.map((check, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <svg
                      className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-300 text-sm">{check}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
