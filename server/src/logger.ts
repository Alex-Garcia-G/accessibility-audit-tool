import pino from 'pino'

// pino-pretty makes logs human-readable in development.
// In production (Railway), we'd drop the transport and output raw JSON
// so the platform can parse and filter it.
export const logger = pino({
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})
