// Pipeline orchestrator — sequences the four agents and broadcasts progress.
//
// This file has two jobs:
//   1. Run the four agents in order, update the DB at each boundary, handle errors
//   2. Emit progress events via an EventEmitter so SSE clients get live updates
//
// Why EventEmitter for SSE instead of something like Redis pub/sub?
//   For a single-server deployment (our current target), a Node.js EventEmitter
//   is the simplest possible solution. It's in-memory, zero-dependency, and
//   perfectly correct as long as there's only one server instance.
//   If we ever scale to multiple instances, we'd swap this for Redis pub/sub —
//   but we don't need that complexity yet.
//
// How the EventEmitter + SSE pairing works:
//   - Each audit gets its own "channel" keyed by String(auditId)
//   - The SSE route (audit.ts) subscribes:  auditEmitter.on('42', handler)
//   - This file emits:                       auditEmitter.emit('42', event)
//   - The SSE handler writes the event to the HTTP response
//   - When the audit finishes or the client disconnects, the listener is removed

import { EventEmitter } from 'node:events'
import { prisma } from '../db.js'
import { logger } from '../logger.js'
import { runScanner, type ScannerInput } from './scanner.js'
import { runAuditor } from './auditor.js'
import { runSeverity } from './severity.js'
import { runReporter } from './reporter.js'
import type { AuditReport } from './types.js'

// ── Progress emitter ───────────────────────────────────────────────────────
export const auditEmitter = new EventEmitter()

// Default max listeners is 10. We raise it because in production we could have
// many SSE clients subscribed simultaneously (each is one listener per auditId).
// 100 is a generous limit — revisit if we see "MaxListenersExceededWarning".
auditEmitter.setMaxListeners(100)

// The shape of every event sent over SSE to the browser.
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

// ── Helpers ────────────────────────────────────────────────────────────────

// Update the Audit row's status column. If the DB write fails (transient
// connection issue, etc.) we log the error but do NOT throw — a status
// update failure should not abort an otherwise-succeeding audit pipeline.
async function setStatus(auditId: number, status: string): Promise<void> {
  try {
    await prisma.audit.update({ where: { id: auditId }, data: { status } })
  } catch (err) {
    logger.error({ err, auditId, status }, 'Failed to update audit status — pipeline continues')
  }
}

// Emit a progress event keyed to this specific audit.
// Using String(auditId) as the event name means listeners scoped to one audit
// are never triggered by another audit's events.
function emit(auditId: number, event: PipelineEvent): void {
  auditEmitter.emit(String(auditId), event)
}

// ── Main pipeline ──────────────────────────────────────────────────────────
export async function runPipeline(
  input: ScannerInput,
  _userId: number,
  auditId: number
): Promise<void> {
  logger.info({ auditId }, 'Pipeline started')

  try {
    // ── Stage 1: Scan ──────────────────────────────────────────────────────
    await setStatus(auditId, 'running')
    emit(auditId, { stage: 'scanning', status: 'started' })

    const scanResult = await runScanner(input)

    emit(auditId, { stage: 'scanning', status: 'complete' })
    logger.info({ auditId, title: scanResult.title }, 'Stage 1 complete: Scanner')

    // ── Stage 2: Audit ─────────────────────────────────────────────────────
    emit(auditId, { stage: 'auditing', status: 'started' })

    const violations = await runAuditor(scanResult)

    emit(auditId, { stage: 'auditing', status: 'complete' })
    logger.info({ auditId, violationCount: violations.length }, 'Stage 2 complete: Auditor')

    // ── Stage 3: Severity ──────────────────────────────────────────────────
    emit(auditId, { stage: 'classifying', status: 'started' })

    const violationsWithSeverity = await runSeverity(violations)

    emit(auditId, { stage: 'classifying', status: 'complete' })
    logger.info({ auditId }, 'Stage 3 complete: Severity')

    // ── Stage 4: Report ────────────────────────────────────────────────────
    emit(auditId, { stage: 'reporting', status: 'started' })

    const report = await runReporter(violationsWithSeverity)

    emit(auditId, { stage: 'reporting', status: 'complete' })
    logger.info({ auditId, score: report.score }, 'Stage 4 complete: Reporter')

    // ── Persist final result ───────────────────────────────────────────────
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: 'complete',
        score: report.score,
        // Prisma's Json field type accepts any serializable object.
        // We cast to `object` to satisfy TypeScript — the runtime value
        // is a plain JS object that Prisma will serialize to JSON for Postgres.
        result: report as object,
      },
    })

    emit(auditId, { stage: 'complete', status: 'complete', data: report })
    logger.info({ auditId, score: report.score }, 'Pipeline complete')
  } catch (err) {
    // Any unhandled error from any agent lands here.
    // We mark the audit as errored in the DB and emit an error event so
    // SSE clients know the pipeline is done (even though it failed).
    logger.error({ err, auditId }, 'Pipeline failed')
    await setStatus(auditId, 'error')
    emit(auditId, {
      stage: 'error',
      status: 'error',
      data: { message: err instanceof Error ? err.message : 'Unknown error' },
    })
  }
}
