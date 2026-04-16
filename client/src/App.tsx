// App.tsx — root component. Manages auth state and renders the route tree.
//
// Auth is checked once on mount. Until we know whether the user is logged in,
// we render a blank screen to avoid a flash of the login page.
//
// Protected routes redirect to / when no user session exists.
// The / route redirects logged-in users to /new so they land on the audit form.

import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getMe, logout } from './api.js'
import { LoginPage } from './components/LoginPage.js'
import { AuditForm } from './components/AuditForm.js'
import { AuditPage } from './pages/AuditPage.js'
import { HistoryPage } from './pages/HistoryPage.js'
import type { CurrentUser } from './types.js'

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  // Check session once on mount. authChecked gates all rendering so we never
  // flash the login page to an already-authenticated user.
  useEffect(() => {
    getMe()
      .then((me) => {
        setUser(me)
        setAuthChecked(true)
      })
      .catch(() => {
        setAuthChecked(true)
      })
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      // Even if the request fails, clear state — the user considers themselves logged out
      setUser(null)
    }
  }

  // Blank screen while /auth/me is in flight — faster than a spinner and avoids layout flash
  if (!authChecked) return <div className="min-h-screen bg-gray-950" />

  return (
    <Routes>
      {/* Public root: redirect authenticated users to the form */}
      <Route path="/" element={user ? <Navigate to="/new" replace /> : <LoginPage />} />

      {/* Protected routes: redirect to / when not logged in */}
      <Route
        path="/new"
        element={
          user ? <AuditForm user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />
        }
      />
      <Route
        path="/history"
        element={
          user ? <HistoryPage user={user} onLogout={handleLogout} /> : <Navigate to="/" replace />
        }
      />
      <Route path="/audit/:id" element={user ? <AuditPage /> : <Navigate to="/" replace />} />

      {/* Catch-all: redirect unknown paths to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
