import { PrismaClient } from '@prisma/client'
import { logger } from './logger.js'

// PrismaClient holds a connection pool to the database.
// We instantiate it exactly once here and export the single instance.
// Every other file that does `import { prisma } from './db.js'` gets this
// same object — Node's module system caches the result of the first import.
//
// Why does this matter? If you did `new PrismaClient()` inside each file
// that needs DB access, you'd open a new connection pool each time. That
// wastes connections (Postgres has a limit), and in development with hot
// module reload you'd quickly hit "too many clients" errors.
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
})

// Forward Prisma's internal events into pino so all logs have the same
// structure and go through the same transport (pretty in dev, JSON in prod).
prisma.$on('error', (e) => logger.error({ err: e }, 'Prisma error'))
prisma.$on('warn', (e) => logger.warn({ msg: e.message }, 'Prisma warning'))

// Log individual SQL queries in development only.
// In production these would be enormous (one log line per DB call) and
// would expose SQL strings in plain text to any log aggregator.
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', (e) => logger.debug({ query: e.query, duration: e.duration }, 'Prisma query'))
}

export { prisma }
