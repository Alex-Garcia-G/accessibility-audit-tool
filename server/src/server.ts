import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import session from 'express-session'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { env } from './env.js'
import { logger } from './logger.js'
import { authRouter } from './auth.js'
import { auditRouter } from './audit.js'

const app = express()
const PORT = env.PORT

// ── Security middleware ────────────────────────────────────────────────────
// helmet sets ~15 HTTP headers that protect against common attacks
// (clickjacking, MIME sniffing, etc.) — one line, big security win.
// We extend the default CSP to allow GitHub avatar images, which come
// from avatars.githubusercontent.com — blocked by default otherwise.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
      },
    },
  })
)

// rate-limit caps requests per IP — prevents someone from hammering the API
// and running up our Anthropic bill
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
)

app.use(express.json())

// ── HTTP request logging ───────────────────────────────────────────────────
// Logs every request once the response finishes. Using res.on('finish') rather
// than logging on the way in means we capture the actual status code that was
// sent — we don't know it until the handler runs and calls res.status()/res.json().
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      ms: Date.now() - start,
    })
  })
  next()
})

// ── Session middleware ─────────────────────────────────────────────────────
// express-session sets a cookie ('sid') on the browser containing only a
// random session ID. The actual session data lives on the server.
//
// Currently using MemoryStore (the default) — sessions are lost on restart
// and won't scale across multiple server instances. That's fine for local
// development. The Prisma Session model exists for when we upgrade to a
// database-backed store in a later phase.
//
// Note: express-session will log a warning about MemoryStore in production.
// This is expected and will go away once we switch to a proper store.
app.use(
  session({
    name: 'sid', // cookie name — must match clearCookie('sid') in auth.ts
    secret: env.SESSION_SECRET,
    resave: false, // don't re-save a session that hasn't changed (performance)
    saveUninitialized: false, // don't create a session until something is stored
    cookie: {
      httpOnly: true, // JS in the browser cannot read this cookie (XSS protection)
      secure: env.NODE_ENV === 'production', // HTTPS-only in prod, HTTP ok in dev
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      sameSite: 'lax', // sent on top-level navigation, blocked on cross-site requests (CSRF protection)
    },
  })
)

// ── Auth routes ────────────────────────────────────────────────────────────
// Mounts the GitHub OAuth routes defined in auth.ts:
//   GET  /auth/github           → redirects browser to GitHub authorize page
//   GET  /auth/github/callback  → handles GitHub's redirect back, creates session
//   POST /auth/logout           → destroys session and clears cookie
//   GET  /auth/me               → returns current session user or 401
//
// IMPORTANT: session middleware must be registered before authRouter.
// Express runs middleware in the order it's registered. If authRouter ran
// first, req.session would be undefined inside the auth handlers.
app.use(authRouter)

// ── Audit routes ───────────────────────────────────────────────────────────
// Mounts the four-agent pipeline routes:
//   POST /audit             → start an audit (URL or HTML file)
//   GET  /audit/:id         → get current status / final result
//   GET  /audit/:id/stream  → SSE stream of live pipeline progress
app.use(auditRouter)

// ── Health check ───────────────────────────────────────────────────────────
// Railway and Docker use this route to know if the container is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Serve React frontend in production ─────────────────────────────────────
// In development, Vite runs on port 5173 and proxies API calls to this server.
// In production, we build the React app to client/dist/ and serve it from here.
// This means one deployed service handles both the API and the UI.
//
// The catch-all route (*) must come LAST — after all API routes — so that
// /audit, /auth, and /health are matched by their own handlers first.
// Only unknown routes (which the React app handles client-side) fall through here.
const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDist = join(__dirname, '..', '..', 'client', 'dist')

if (existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
  logger.info({ clientDist }, 'Serving React frontend from dist')
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started')
})

export default app
