// HistoryPage — shows the current user's last 20 audits.
//
// Each row links to /audit/:id, which renders the saved report.
// The score badge is color-coded the same way as the main report.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAudits, deleteAudit } from '../api.js'
import type { AuditListItem, CurrentUser } from '../types.js'
import { SCORE_GREEN, SCORE_YELLOW } from '../constants.js'

interface Props {
  user: CurrentUser
  onLogout: () => void
}

function scoreBadgeClass(score: number | null, status: AuditListItem['status']): string {
  if (status === 'error') return 'bg-red-950 text-red-400 border border-red-900'
  if (status === 'pending' || status === 'running')
    return 'bg-blue-950 text-blue-400 border border-blue-900'
  if (score === null) return 'bg-gray-800 text-gray-400'
  if (score >= SCORE_GREEN) return 'bg-green-950 text-green-400 border border-green-900'
  if (score >= SCORE_YELLOW) return 'bg-yellow-950 text-yellow-400 border border-yellow-900'
  return 'bg-red-950 text-red-400 border border-red-900'
}

function scoreBadgeText(score: number | null, status: AuditListItem['status']): string {
  if (status === 'error') return 'Failed'
  if (status === 'pending' || status === 'running') return 'Running…'
  if (score === null) return '—'
  return String(score)
}

// Format an ISO timestamp as a relative or absolute date string
function formatDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function HistoryPage({ user, onLogout }: Props) {
  const [audits, setAudits] = useState<AuditListItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    document.title = 'Audit History | Accessibility Audit Tool'
  }, [])

  function loadAudits() {
    setLoadError(false)
    setAudits(null)
    getAudits()
      .then(setAudits)
      .catch(() => setLoadError(true))
  }

  useEffect(() => {
    loadAudits()
  }, [])

  async function handleDelete(auditId: number) {
    setDeletingId(auditId)
    try {
      await deleteAudit(auditId)
      setAudits((prev) => prev?.filter((a) => a.id !== auditId) ?? prev)
    } catch {
      // If the delete fails, just re-enable the button — the row stays in the list.
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Top nav — matches AuditForm nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-6">
          <h1 className="text-white font-semibold text-lg">Accessibility Audit Tool</h1>
          <Link to="/new" className="text-gray-400 hover:text-white text-sm transition-colors">
            New Audit
          </Link>
          <span className="text-gray-600 text-sm">History</span>
        </div>
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full" />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm text-white font-bold"
              aria-label={user.username}
            >
              {user.username[0].toUpperCase()}
            </div>
          )}
          <span className="text-gray-400 text-sm">{user.username}</span>
          <button
            onClick={onLogout}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 rounded"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div id="main-content" className="max-w-3xl mx-auto w-full px-4 py-10">
        <h2 className="text-white text-2xl font-bold mb-6">Audit History</h2>

        {/* Skeleton loading state — placeholder rows that match the real row layout */}
        {audits === null && !loadError && (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center bg-gray-900 border border-gray-800 rounded-xl px-5 py-4"
              >
                {/* Left: type badge + label */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-3.5 w-8 bg-gray-800 rounded flex-shrink-0" />
                  <div className="h-3.5 bg-gray-800 rounded w-48" />
                </div>
                {/* Right: score badge + date */}
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="h-5 w-10 bg-gray-800 rounded-full" />
                  <div className="h-3.5 w-14 bg-gray-800 rounded" />
                </div>
                {/* Trash icon placeholder */}
                <div className="ml-4 h-4 w-4 bg-gray-800 rounded flex-shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div role="alert" className="flex flex-col items-center gap-4 py-16">
            <p className="text-red-400 text-sm">Failed to load audits.</p>
            <button
              onClick={loadAudits}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {audits !== null && audits.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-16">
            No audits yet.{' '}
            <Link to="/new" className="text-blue-400 hover:text-blue-300 transition-colors">
              Run your first audit.
            </Link>
          </div>
        )}

        {/* Audit list */}
        {audits !== null && audits.length > 0 && (
          <div className="space-y-3">
            {audits.map((audit) => (
              <div
                key={audit.id}
                className="flex items-center bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 hover:bg-gray-800/50 transition-all group"
              >
                {/* Clickable area — navigates to the report */}
                <Link
                  to={`/audit/${audit.id}`}
                  className="flex-1 flex items-center justify-between px-5 py-4 min-w-0"
                >
                  {/* Left: input type icon + label */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 uppercase ${
                        audit.inputType === 'url'
                          ? 'bg-blue-950 text-blue-400 border border-blue-900'
                          : 'bg-purple-950 text-purple-400 border border-purple-900'
                      }`}
                    >
                      {audit.inputType}
                    </span>
                    <span className="text-gray-300 text-sm truncate group-hover:text-white transition-colors">
                      {audit.inputLabel}
                    </span>
                  </div>

                  {/* Right: score badge + date */}
                  <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${scoreBadgeClass(audit.score, audit.status)}`}
                    >
                      {scoreBadgeText(audit.score, audit.status)}
                    </span>
                    <span className="text-gray-600 text-xs">{formatDate(audit.createdAt)}</span>
                  </div>
                </Link>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(audit.id)}
                  disabled={deletingId === audit.id}
                  aria-label={`Delete audit for ${audit.inputLabel}`}
                  className="px-4 py-4 text-gray-600 hover:text-red-400 hover:bg-red-950/30 rounded-r-xl disabled:opacity-40 transition-all flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-inset"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
