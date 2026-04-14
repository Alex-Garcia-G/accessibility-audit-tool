import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { logger } from './logger.js'

const app = express()
const PORT = process.env.PORT ?? 3000

// ── Security middleware ────────────────────────────────────────────────────
// helmet sets ~15 HTTP headers that protect against common attacks
// (clickjacking, MIME sniffing, etc.) — one line, big security win
app.use(helmet())

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

// ── Health check ───────────────────────────────────────────────────────────
// Railway and Docker use this route to know if the container is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started')
})

export default app
