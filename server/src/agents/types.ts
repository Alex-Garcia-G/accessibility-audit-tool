// Zod schemas for all data flowing through the four-agent pipeline.
//
// Why Zod here? Each agent asks Claude to return JSON. Claude is usually
// correct, but occasionally misnames a field or omits a required one.
// Zod validates the parsed JSON and throws a descriptive error if anything
// is wrong — which withRetry() catches and retries. This means malformed
// Claude output gets retried automatically rather than silently corrupting
// the pipeline or crashing with a confusing TypeError later.
//
// We derive TypeScript types from the schemas (z.infer<typeof Schema>)
// so there is exactly one source of truth. Change the schema and the types
// update automatically — no manual interface maintenance.

import { z } from 'zod'

// ── ScanResult ─────────────────────────────────────────────────────────────
// Output of the Scanner agent. The stripped HTML is what every downstream
// agent reasons about. inputType and inputLabel are preserved for the report.
export const ScanResultSchema = z.object({
  html: z.string(), // accessibility-relevant HTML (scripts/styles removed)
  title: z.string(), // page <title>, used in the report header
  inputType: z.string(), // 'url' | 'file' — mirrors Audit.inputType in DB
  inputLabel: z.string(), // the URL or filename — shown in audit history
})
export type ScanResult = z.infer<typeof ScanResultSchema>

// ── Violation ──────────────────────────────────────────────────────────────
// A single WCAG violation found by the Auditor. Four required fields force
// Claude to be specific rather than returning vague generalizations.
export const ViolationSchema = z.object({
  wcagCriteria: z.string(), // e.g. "1.1.1 Non-text Content (Level A)"
  description: z.string(), // what the specific problem is on this page
  element: z.string(), // the HTML snippet that triggered the violation
  suggestion: z.string(), // plain-English fix recommendation
})
export type Violation = z.infer<typeof ViolationSchema>

// ── ViolationWithSeverity ──────────────────────────────────────────────────
// The Auditor output extended with a severity level from the Severity agent.
export const SeverityLevelSchema = z.enum(['critical', 'serious', 'moderate', 'minor'])
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>

export const ViolationWithSeveritySchema = ViolationSchema.extend({
  severity: SeverityLevelSchema,
})
export type ViolationWithSeverity = z.infer<typeof ViolationWithSeveritySchema>

// ── ReportViolation ────────────────────────────────────────────────────────
// A violation enriched with an optional code fix example from the Reporter.
// fixExample is only generated for critical and serious violations — the
// high-impact ones where showing a corrected snippet makes the most difference.
export const ReportViolationSchema = ViolationWithSeveritySchema.extend({
  fixExample: z.string().optional(),
})
export type ReportViolation = z.infer<typeof ReportViolationSchema>

// ── AuditReport ────────────────────────────────────────────────────────────
// The final pipeline output, stored in Audit.result as JSON in the database.
export const AuditReportSchema = z.object({
  score: z.number().int().min(0).max(100), // 0-100 accessibility score
  summary: z.string(), // executive prose paragraph
  violations: z.array(ReportViolationSchema),
  passedChecks: z.array(z.string()), // things Claude confirmed look correct
})
export type AuditReport = z.infer<typeof AuditReportSchema>
