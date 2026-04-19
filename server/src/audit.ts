// Audit routes — the HTTP interface to the pipeline.
//
// Three routes:
//   POST /audit              — start an audit (URL or HTML file)
//   GET  /audit/:id          — get current status / final result
//   GET  /audit/:id/stream   — SSE stream of live pipeline progress
//
// All routes are protected by requireAuth. Users can only see their own audits.

import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { prisma } from './db.js'
import { logger } from './logger.js'
import { requireAuth } from './auth.js'
import { runPipeline, auditEmitter, type PipelineEvent } from './agents/pipeline.js'
import type { AuditReport } from './agents/types.js'

const router = Router()

// Maximum number of audits returned by GET /audits
const AUDIT_LIMIT = 20

// Per-user rate limit for POST /audit.
// The global limiter in server.ts is IP-based — it won't stop a single logged-in
// user from running dozens of audits and burning through Anthropic API credits.
// This limiter keys by userId so each account gets its own independent counter.
const auditRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 audits per user per hour
  keyGenerator: (req: Request) => String(req.session.userId),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many audits. You can run up to 10 per hour — please try again later.' },
})

// multer processes multipart/form-data requests (file uploads).
// memoryStorage keeps the file as a Buffer in req.file.buffer — no disk writes.
// This is fine for HTML files, which are typically small (<1MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB cap
  fileFilter: (_req, file, cb) => {
    // Reject anything that isn't HTML — we can't meaningfully audit a PDF or image
    if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
      cb(null, true)
    } else {
      cb(new Error('Only .html files are accepted'))
    }
  },
})

// ── POST /audit ────────────────────────────────────────────────────────────
// Accepts two input formats:
//   1. JSON body:          { "type": "url", "url": "https://example.com" }
//   2. Multipart form:     field named "file" containing an .html file
//
// Returns HTTP 202 (Accepted) with { auditId } immediately.
// HTTP 202 means "I got your request and it's being processed" — it does NOT
// mean the audit is complete. The client uses auditId to poll or stream progress.
router.post(
  '/audit',
  requireAuth,
  auditRateLimit,
  // upload.single('file') handles multipart requests. For JSON requests it's a
  // no-op — multer simply calls next() if the content-type isn't multipart.
  upload.single('file'),
  async (req: Request, res: Response) => {
    const userId = req.session.userId!

    try {
      let inputType: string
      let inputLabel: string
      let pipelineInput: { type: 'url'; url: string } | { type: 'file'; html: string }

      if (req.file) {
        // ── File upload path ───────────────────────────────────────────────
        // req.file.buffer is the raw file bytes from multer's memoryStorage.
        // We decode it as UTF-8 text to get the HTML string.
        const html = req.file.buffer.toString('utf8')
        inputType = 'file'
        inputLabel = req.file.originalname
        pipelineInput = { type: 'file', html }
      } else if (req.body?.type === 'url' && typeof req.body.url === 'string') {
        // ── URL path ───────────────────────────────────────────────────────
        const { url } = req.body as { url: string }

        // new URL() throws a TypeError if the string isn't a valid URL.
        // Catching it here gives the client a clean 400 instead of a 500.
        try {
          new URL(url)
        } catch {
          res.status(400).json({ error: 'Invalid URL — must be a full URL including https://' })
          return
        }

        inputType = 'url'
        inputLabel = url
        pipelineInput = { type: 'url', url }
      } else {
        res.status(400).json({
          error: 'Provide either { type: "url", url: "https://..." } or an HTML file upload',
        })
        return
      }

      // Create the Audit row before firing the pipeline.
      // This ensures GET /audit/:id never returns 404 for a valid auditId,
      // even in the brief window between the POST response and pipeline start.
      const audit = await prisma.audit.create({
        data: { userId, inputType, inputLabel, status: 'pending' },
      })

      // Fire the pipeline without awaiting it.
      // The pipeline takes 20-60 seconds — we cannot make the client wait.
      // It runs in the background, updating the DB and emitting SSE events.
      // The .catch() handles the edge case where runPipeline throws before
      // reaching its own internal try/catch (should never happen, but logged defensively).
      runPipeline(pipelineInput, userId, audit.id).catch((err) => {
        logger.error({ err, auditId: audit.id }, 'Unhandled error escaping pipeline')
      })

      // 202 Accepted — the request is valid and processing has started
      res.status(202).json({ auditId: audit.id })
    } catch (err) {
      logger.error({ err }, 'Failed to create audit row')
      res.status(500).json({ error: 'Failed to start audit' })
    }
  }
)

// ── GET /audit/:id ─────────────────────────────────────────────────────────
// Returns the current state of an audit. The client can poll this every few
// seconds, or just call it once after the SSE stream emits 'complete'.
router.get('/audit/:id', requireAuth, async (req: Request, res: Response) => {
  const auditId = parseInt(String(req.params.id), 10)
  if (isNaN(auditId)) {
    res.status(400).json({ error: 'Invalid audit ID' })
    return
  }

  try {
    const audit = await prisma.audit.findUnique({ where: { id: auditId } })

    // Check 404 BEFORE 403. If we returned 403 for a non-existent audit ID,
    // an attacker could use that to enumerate which audit IDs exist and belong
    // to other users. Returning 404 first leaks nothing.
    if (!audit) {
      res.status(404).json({ error: 'Audit not found' })
      return
    }

    if (audit.userId !== req.session.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    res.json({
      id: audit.id,
      status: audit.status,
      score: audit.score,
      inputType: audit.inputType,
      inputLabel: audit.inputLabel,
      result: audit.result,
      createdAt: audit.createdAt,
    })
  } catch (err) {
    logger.error({ err, auditId }, 'Failed to fetch audit')
    res.status(500).json({ error: 'Failed to fetch audit' })
  }
})

// ── GET /audit/:id/stream ──────────────────────────────────────────────────
// Server-Sent Events endpoint. The browser opens this connection and receives
// a text/event-stream response that stays open. As each pipeline stage
// completes, we write a "data: {...}\n\n" line which the browser's EventSource
// API fires as a message event.
//
// SSE vs WebSockets: SSE is simpler (one-way server→client, plain HTTP,
// built-in browser reconnect) and perfectly sufficient for progress updates
// where the client only needs to listen, not send messages back.
router.get('/audit/:id/stream', requireAuth, async (req: Request, res: Response) => {
  const auditId = parseInt(String(req.params.id), 10)
  if (isNaN(auditId)) {
    res.status(400).json({ error: 'Invalid audit ID' })
    return
  }

  // Auth + ownership check must happen BEFORE we set SSE headers.
  // Once we call res.setHeader() and res.flushHeaders(), we can no longer
  // change the HTTP status code — the response has started. So we check
  // everything first while we can still return clean 4xx responses.
  try {
    const audit = await prisma.audit.findUnique({ where: { id: auditId } })
    if (!audit) {
      res.status(404).json({ error: 'Audit not found' })
      return
    }
    if (audit.userId !== req.session.userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    // If the audit already finished before the client opened the stream
    // (e.g., slow network, or the client is reconnecting), send the final
    // event immediately and close the connection.
    if (audit.status === 'complete' || audit.status === 'error') {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      const finalEvent: PipelineEvent = {
        stage: audit.status === 'complete' ? 'complete' : 'error',
        status: audit.status === 'complete' ? 'complete' : 'error',
        data:
          audit.status === 'complete'
            ? (audit.result as unknown as AuditReport)
            : { message: 'Audit failed' },
      }
      res.write(`data: ${JSON.stringify(finalEvent)}\n\n`)
      res.end()
      return
    }
  } catch (err) {
    logger.error({ err, auditId }, 'Failed to verify audit for SSE stream')
    res.status(500).json({ error: 'Stream setup failed' })
    return
  }

  // ── Open the SSE connection ────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // flushHeaders() sends the HTTP headers immediately (without waiting for
  // the first res.write()). This is required for SSE — without it, some
  // HTTP clients buffer the response and the browser sees nothing until
  // the connection closes.
  res.flushHeaders()

  const eventKey = String(auditId)

  const onEvent = (event: PipelineEvent): void => {
    // SSE format: "data: <json>\n\n"
    // The double newline signals the end of one event to the browser.
    res.write(`data: ${JSON.stringify(event)}\n\n`)

    // Some reverse proxies (nginx, Railway) buffer SSE data.
    // Calling res.flush() (added by the compression middleware if present)
    // forces the bytes through immediately.
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      ;(res as unknown as { flush: () => void }).flush()
    }

    // Close the stream after terminal events so the connection doesn't
    // stay open indefinitely after the audit is done.
    if (event.stage === 'complete' || event.stage === 'error') {
      cleanup()
      res.end()
    }
  }

  const cleanup = (): void => {
    auditEmitter.removeListener(eventKey, onEvent)
  }

  auditEmitter.on(eventKey, onEvent)

  // If the browser tab closes or the user navigates away, the 'close' event
  // fires on req. Remove the listener immediately to prevent a memory leak —
  // otherwise the EventEmitter accumulates stale listeners for abandoned audits.
  req.on('close', cleanup)
})

// ── GET /audits ────────────────────────────────────────────────────────────
// Returns the current user's 20 most recent audits, newest first.
// Does NOT include the result JSON — that field can be large and isn't needed
// for a list view. Clients fetch GET /audit/:id when they want the full report.
router.get('/audits', requireAuth, async (req: Request, res: Response) => {
  try {
    const audits = await prisma.audit.findMany({
      where: { userId: req.session.userId },
      orderBy: { createdAt: 'desc' },
      take: AUDIT_LIMIT,
      select: {
        id: true,
        status: true,
        score: true,
        inputType: true,
        inputLabel: true,
        createdAt: true,
      },
    })
    res.json(audits)
  } catch (err) {
    logger.error({ err }, 'Failed to fetch audits list')
    res.status(500).json({ error: 'Failed to fetch audits' })
  }
})

export { router as auditRouter }
