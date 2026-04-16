// API helper — all HTTP calls to the backend in one place.
//
// Why centralise fetch calls?
// If we ever change the API (different paths, auth headers, error handling),
// we change it here once rather than hunting through every component.
//
// All functions throw on non-2xx responses so callers can catch errors
// in a try/catch without having to check res.ok themselves.

import type { AuditListItem, AuditRow, CurrentUser } from './types.js'

// ── Auth ─────────────────────────────────────────────────────────────────────

// Fetch the currently logged-in user. Returns null if not authenticated.
// The backend returns 401 when there's no session — we treat that as "not logged in"
// rather than an error, so we return null instead of throwing.
export async function getMe(): Promise<CurrentUser | null> {
  const res = await fetch('/auth/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`)
  return res.json() as Promise<CurrentUser>
}

// Logout: destroy the session on the server and clear the cookie.
export async function logout(): Promise<void> {
  const res = await fetch('/auth/logout', { method: 'POST' })
  if (!res.ok) throw new Error(`POST /auth/logout failed: ${res.status}`)
}

// ── Audits ────────────────────────────────────────────────────────────────────

// Start a URL audit. Returns the new auditId.
// The backend returns HTTP 202 Accepted immediately — the pipeline runs in the background.
export async function startUrlAudit(url: string): Promise<number> {
  const res = await fetch('/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'url', url }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `POST /audit failed: ${res.status}`)
  }
  const data = (await res.json()) as { auditId: number }
  return data.auditId
}

// Start a file audit. Returns the new auditId.
// We send the file as multipart/form-data — the browser sets the Content-Type header
// automatically when you pass a FormData object to fetch (do NOT set it manually,
// or the browser won't include the boundary parameter and multer will reject it).
export async function startFileAudit(file: File): Promise<number> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/audit', { method: 'POST', body: form })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `POST /audit failed: ${res.status}`)
  }
  const data = (await res.json()) as { auditId: number }
  return data.auditId
}

// Fetch the current state of an audit (used to poll, or load a finished audit).
export async function getAudit(auditId: number): Promise<AuditRow> {
  const res = await fetch(`/audit/${auditId}`)
  if (!res.ok) throw new Error(`GET /audit/${auditId} failed: ${res.status}`)
  return res.json() as Promise<AuditRow>
}

// Fetch the current user's last 20 audits (newest first), without the full result JSON.
export async function getAudits(): Promise<AuditListItem[]> {
  const res = await fetch('/audits')
  if (!res.ok) throw new Error(`GET /audits failed: ${res.status}`)
  return res.json() as Promise<AuditListItem[]>
}
