// HistoryPage — shows the current user's last 20 audits.
//
// Each row links to /audit/:id, which renders the saved report.
// The score badge is color-coded the same way as the main report.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAudits } from '../api.js'
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

  useEffect(() => {
    getAudits()
      .then(setAudits)
      .catch(() => setLoadError(true))
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
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
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto w-full px-4 py-10">
        <h2 className="text-white text-2xl font-bold mb-6">Audit History</h2>

        {/* Loading state */}
        {audits === null && !loadError && (
          <div className="text-gray-500 text-sm text-center py-16">Loading…</div>
        )}

        {/* Error state */}
        {loadError && (
          <div role="alert" className="text-red-400 text-sm text-center py-16">
            Failed to load audits.
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
              <Link
                key={audit.id}
                to={`/audit/${audit.id}`}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 hover:border-gray-600 transition-colors group"
              >
                {/* Left: input type icon + label */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-600 text-xs font-mono flex-shrink-0 uppercase">
                    {audit.inputType}
                  </span>
                  <span className="text-gray-200 text-sm truncate group-hover:text-white transition-colors">
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
