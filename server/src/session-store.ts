// PrismaSessionStore — a custom express-session store backed by PostgreSQL.
//
// Why replace the default MemoryStore?
//   MemoryStore holds sessions in the Node.js process heap. Every server restart
//   (which happens on every deploy) wipes all sessions and logs everyone out.
//   With this store, sessions survive restarts and deploys because they live in
//   the same PostgreSQL database as the rest of the app data.
//
// How express-session stores work:
//   The Store base class defines an interface with three required methods.
//   express-session calls them automatically — we never call them directly.
//     get(sid)          → called on every request to load the session
//     set(sid, data)    → called when session data changes (login, etc.)
//     destroy(sid)      → called on logout (req.session.destroy())

import { Store } from 'express-session'
import type { SessionData } from 'express-session'
import type { Prisma } from '@prisma/client'
import { prisma } from './db.js'

// Matches the cookie maxAge in server.ts — used as a fallback TTL when
// the cookie expiry isn't set on the session object.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Serialize a SessionData object into a plain JSON-compatible record.
// JSON.parse(JSON.stringify(...)) runs .toJSON() on the Cookie object,
// which strips non-serializable properties and gives us a clean plain object.
function serialize(session: SessionData): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(session)) as Prisma.InputJsonObject
}

export class PrismaSessionStore extends Store {
  // Load a session by its ID. Returns null if not found or expired.
  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    prisma.session
      .findUnique({ where: { id: sid } })
      .then((row) => {
        // Treat expired sessions the same as missing — don't serve stale data
        if (!row || row.expiresAt < new Date()) {
          callback(null, null)
          return
        }
        callback(null, row.data as unknown as SessionData)
      })
      .catch(callback)
  }

  // Persist a session. Called on login and whenever session data changes.
  // Upsert handles both creating new sessions and updating existing ones.
  set(sid: string, session: SessionData, callback: (err?: unknown) => void): void {
    const expiresAt = session.cookie.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + SESSION_TTL_MS)

    prisma.session
      .upsert({
        where: { id: sid },
        update: { data: serialize(session), expiresAt, userId: session.userId ?? null },
        create: {
          id: sid,
          data: serialize(session),
          expiresAt,
          userId: session.userId ?? null,
        },
      })
      .then(() => callback())
      .catch(callback)
  }

  // Delete a session. Called on logout via req.session.destroy().
  // P2025 is Prisma's "record not found" error — the session may have already
  // expired and been cleaned up, so we treat that as a successful destroy.
  destroy(sid: string, callback: (err?: unknown) => void): void {
    prisma.session
      .delete({ where: { id: sid } })
      .then(() => callback())
      .catch((err: { code?: string }) => {
        if (err?.code === 'P2025') callback()
        else callback(err)
      })
  }
}
