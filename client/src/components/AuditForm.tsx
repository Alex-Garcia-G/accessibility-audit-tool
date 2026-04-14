// AuditForm — lets the user submit a URL or HTML file for auditing.
//
// React concepts used here:
//   useState: tracks which input mode is active, the URL text, the selected file,
//             and whether a submission is in progress.
//   Props:    the parent passes a callback (onAuditStarted) — when the POST succeeds,
//             we call it with the auditId so App.tsx can switch to the progress view.
//             This is the standard React pattern: child notifies parent via a callback prop.

import { useState } from 'react'
import { startUrlAudit, startFileAudit } from '../api.js'
import type { CurrentUser } from '../types.js'

interface Props {
  user: CurrentUser
  onAuditStarted: (auditId: number, inputLabel: string) => void // called when POST /audit returns {auditId}
  onLogout: () => void
}

export function AuditForm({ user, onAuditStarted, onLogout }: Props) {
  // Which tab is active: URL input or file upload
  const [mode, setMode] = useState<'url' | 'file'>('url')

  // The URL the user has typed (only used when mode === 'url')
  const [url, setUrl] = useState('')

  // The file the user selected (only used when mode === 'file')
  const [file, setFile] = useState<File | null>(null)

  // True while the POST request is in flight — disables the button to prevent double-submit
  const [loading, setLoading] = useState(false)

  // Error message to show if the POST fails
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    // Prevent the browser's default form submission (which would reload the page)
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      let auditId: number

      let inputLabel: string

      if (mode === 'url') {
        if (!url.trim()) {
          setError('Please enter a URL')
          return
        }
        auditId = await startUrlAudit(url.trim())
        inputLabel = url.trim()
      } else {
        if (!file) {
          setError('Please select an HTML file')
          return
        }
        auditId = await startFileAudit(file)
        inputLabel = file.name
      }

      // Tell the parent component the audit has started — it will switch views
      onAuditStarted(auditId, inputLabel)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit')
    } finally {
      // Always clear loading state, even if there was an error
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h1 className="text-white font-semibold text-lg">Accessibility Audit Tool</h1>
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full" />
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

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <h2 className="text-white text-2xl font-bold mb-2 text-center">
            Run an Accessibility Audit
          </h2>
          <p className="text-gray-400 text-sm text-center mb-8">
            We'll check against WCAG 2.1 Level AA and give you a scored report with code fixes.
          </p>

          <form
            onSubmit={handleSubmit}
            className="bg-gray-900 rounded-xl p-6 border border-gray-800"
          >
            {/* Mode tabs */}
            <div className="flex gap-2 mb-6">
              <button
                type="button" // type="button" prevents this from submitting the form
                onClick={() => {
                  setMode('url')
                  setError(null)
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'url'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('file')
                  setError(null)
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'file'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                HTML File
              </button>
            </div>

            {/* Input area — changes based on active mode */}
            {mode === 'url' ? (
              <div className="mb-4">
                <label className="block text-gray-300 text-sm mb-2" htmlFor="url-input">
                  Website URL
                </label>
                <input
                  id="url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm placeholder-gray-600 border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-gray-300 text-sm mb-2" htmlFor="file-input">
                  HTML File (max 1MB)
                </label>
                <input
                  id="file-input"
                  type="file"
                  accept=".html,text/html"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-gray-300 file:text-xs"
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="mb-4 text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {/* Submit button — disabled while loading to prevent double-submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Starting audit…' : 'Run Audit'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
