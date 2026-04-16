// Shared TypeScript types for the frontend.
//
// These mirror the shapes the backend returns — the Zod schemas in
// server/src/agents/types.ts are the source of truth, but we can't import
// server code directly into the browser. So we redeclare the shapes here.
// If you change the backend schemas, update these too.

// ── Pipeline progress (SSE stream) ──────────────────────────────────────────
// Each event from GET /audit/:id/stream has this shape.
// "stage" tells you which agent just started or finished.
export type PipelineStage =
  | 'scanning'
  | 'auditing'
  | 'classifying'
  | 'reporting'
  | 'complete'
  | 'error'

export interface PipelineEvent {
  stage: PipelineStage
  status: 'started' | 'complete' | 'error'
  data?: AuditReport | { message: string }
}

// ── Audit report (final result) ──────────────────────────────────────────────
// Returned in GET /audit/:id as the `result` field once status === 'complete'.
// Also delivered as the `data` field in the final SSE event.

export interface Violation {
  wcagCriteria: string // e.g. "1.1.1 Non-text Content"
  description: string // what's wrong
  element: string // the offending HTML snippet
  suggestion: string // how to fix it
  severity: 'critical' | 'serious' | 'moderate' | 'minor'
  fixExample?: string // corrected HTML (only on critical/serious)
}

export interface AuditReport {
  score: number // 0–100
  summary: string // executive summary prose
  violations: Violation[]
  passedChecks: string[]
}

// ── Audit row (GET /audit/:id) ────────────────────────────────────────────────
// The DB row shape that the GET endpoint returns.
export interface AuditRow {
  id: number
  status: 'pending' | 'running' | 'complete' | 'error'
  score: number | null
  inputType: string
  inputLabel: string
  result: AuditReport | null
  createdAt: string
}

// ── Audit list item (GET /audits) ────────────────────────────────────────────
// Subset of AuditRow — no result field (too large for a list view).
export interface AuditListItem {
  id: number
  status: 'pending' | 'running' | 'complete' | 'error'
  score: number | null
  inputType: string
  inputLabel: string
  createdAt: string
}

// ── Current user (GET /auth/me) ──────────────────────────────────────────────
export interface CurrentUser {
  userId: number
  username: string
  avatarUrl: string | null
}
