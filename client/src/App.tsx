// App.tsx — the root component. Decides which "page" to show.
//
// Think of App as the traffic controller. It holds the top-level state
// and renders one of four views depending on that state:
//
//   1. loading  → blank screen while we check if the user is logged in
//   2. login    → LoginPage (not authenticated)
//   3. form     → AuditForm (logged in, ready to submit)
//   4. progress → ProgressTracker (audit started, waiting for results)
//   5. report   → AuditReport (pipeline complete, showing results)
//
// This pattern — one root component holding a "view" discriminant — is a simple
// alternative to a router library (like React Router). We don't need URL routing
// because the app is essentially a single workflow: log in → audit → results.

import { useEffect, useState, useCallback } from 'react'
import { getMe, logout } from './api.js'
import { LoginPage } from './components/LoginPage.js'
import { AuditForm } from './components/AuditForm.js'
import { ProgressTracker } from './components/ProgressTracker.js'
import { AuditReport } from './components/AuditReport.js'
import { ErrorView } from './components/ErrorView.js'
import type { CurrentUser, AuditReport as AuditReportType } from './types.js'

// The discriminated union type for our view state.
// Each variant carries exactly the data that view needs — no optional fields,
// no ambiguity about what's available in which view.
type AppView =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'form' }
  | { kind: 'progress'; auditId: number; inputLabel: string }
  | { kind: 'report'; report: AuditReportType; inputLabel: string }
  | { kind: 'error'; message: string }

function App() {
  const [view, setView] = useState<AppView>({ kind: 'loading' })
  const [user, setUser] = useState<CurrentUser | null>(null)

  // On mount, check if the user is already logged in.
  // This runs once when the app first loads (the [] dependency array means "run once").
  // Without this, every page refresh would show the login screen even if you have a session.
  useEffect(() => {
    getMe()
      .then((me) => {
        if (me) {
          setUser(me)
          setView({ kind: 'form' })
        } else {
          setView({ kind: 'login' })
        }
      })
      .catch(() => {
        // Network error — fall back to login screen
        setView({ kind: 'login' })
      })
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      // Even if the logout request fails, clear local state — the user considers themselves logged out
      setUser(null)
      setView({ kind: 'login' })
    }
  }

  // useCallback memoizes these functions so they don't change on every render.
  // This matters because ProgressTracker's useEffect depends on onComplete and onError —
  // if they were new function references on every render, the effect would re-run constantly.
  const handleAuditStarted = useCallback((auditId: number, inputLabel: string) => {
    setView({ kind: 'progress', auditId, inputLabel })
  }, [])

  const handleComplete = useCallback((report: AuditReportType) => {
    // inputLabel is carried in the progress view state — read it from there
    setView((prev) => ({
      kind: 'report',
      report,
      inputLabel: prev.kind === 'progress' ? prev.inputLabel : '',
    }))
  }, [])

  const handleError = useCallback((message: string) => {
    setView({ kind: 'error', message })
  }, [])

  const handleNewAudit = useCallback(() => {
    setView({ kind: 'form' })
  }, [])

  // Render the correct view based on current state
  switch (view.kind) {
    case 'loading':
      // Simple blank screen while the /auth/me request is in flight.
      // A spinner here would flash for <100ms on fast connections and look worse than nothing.
      return <div className="min-h-screen bg-gray-950" />

    case 'login':
      return <LoginPage />

    case 'form':
      // user is guaranteed non-null when view.kind === 'form' because we only
      // set 'form' after a successful getMe() call that returned a user.
      return <AuditForm user={user!} onAuditStarted={handleAuditStarted} onLogout={handleLogout} />

    case 'progress':
      return (
        <ProgressTracker auditId={view.auditId} onComplete={handleComplete} onError={handleError} />
      )

    case 'report':
      return (
        <AuditReport
          report={view.report}
          inputLabel={view.inputLabel}
          onNewAudit={handleNewAudit}
        />
      )

    case 'error':
      return <ErrorView message={view.message} onRetry={handleNewAudit} />
  }
}

export default App
