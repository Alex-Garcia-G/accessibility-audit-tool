// AuditPage — route component for /audit/:id
//
// Handles two cases with one component:
//   1. Live audit (status pending/running): renders ProgressTracker, which streams
//      SSE events. When the pipeline finishes, we flip to the report view in-place.
//   2. Historical audit (status complete/error): renders the final report or error
//      view directly — no streaming needed, data is already in the DB.
//
// This means bookmarking /audit/42 always works: the first GET /audit/42 tells us
// which case we're in, and we render accordingly.

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAudit } from '../api.js'
import { ProgressTracker } from '../components/ProgressTracker.js'
import { AuditReport } from '../components/AuditReport.js'
import { ErrorView } from '../components/ErrorView.js'
import type { AuditReport as AuditReportType } from '../types.js'

type PageView =
  | { kind: 'loading' }
  | { kind: 'progress'; inputLabel: string }
  | { kind: 'report'; report: AuditReportType; inputLabel: string }
  | { kind: 'error'; message: string }

export function AuditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const auditId = parseInt(id ?? '', 10)

  // Initialise to error immediately if the URL param is not a valid integer —
  // avoids calling setState synchronously inside an effect (ESLint react-hooks/set-state-in-effect).
  const [view, setView] = useState<PageView>(
    isNaN(auditId) ? { kind: 'error', message: 'Invalid audit ID' } : { kind: 'loading' }
  )

  // On mount, fetch the audit to determine its current state.
  // This determines whether we show live progress or a finished result.
  useEffect(() => {
    if (isNaN(auditId)) return // already handled by initial state above

    getAudit(auditId)
      .then((audit) => {
        if (audit.status === 'complete') {
          // Report already in DB — render it directly without opening an SSE stream
          setView({ kind: 'report', report: audit.result!, inputLabel: audit.inputLabel })
        } else if (audit.status === 'error') {
          setView({ kind: 'error', message: 'This audit encountered an error. Please try again.' })
        } else {
          // pending or running — open the SSE stream and show live progress
          setView({ kind: 'progress', inputLabel: audit.inputLabel })
        }
      })
      .catch(() => {
        setView({ kind: 'error', message: 'Audit not found.' })
      })
  }, [auditId])

  // Called by ProgressTracker when the pipeline finishes successfully.
  // useCallback so the effect in ProgressTracker doesn't re-run on every render.
  const handleComplete = useCallback((report: AuditReportType) => {
    setView((prev) => ({
      kind: 'report',
      report,
      // inputLabel was stored in the progress view — carry it forward
      inputLabel: prev.kind === 'progress' ? prev.inputLabel : '',
    }))
  }, [])

  const handleError = useCallback((message: string) => {
    setView({ kind: 'error', message })
  }, [])

  switch (view.kind) {
    case 'loading':
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <svg
              className="w-8 h-8 text-blue-500 animate-spin"
              aria-label="Loading audit"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-gray-500 text-sm">Loading audit…</span>
          </div>
        </div>
      )

    case 'progress':
      return <ProgressTracker auditId={auditId} onComplete={handleComplete} onError={handleError} />

    case 'report':
      return <AuditReport report={view.report} inputLabel={view.inputLabel} />

    case 'error':
      return <ErrorView message={view.message} onRetry={() => navigate('/new')} />
  }
}
