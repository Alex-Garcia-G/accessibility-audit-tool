// GitHub OAuth — the three-legged dance:
//
//   1. User clicks "Sign in" → we redirect them to GitHub (/auth/github)
//   2. User approves on GitHub → GitHub redirects back to us with a ?code= (/auth/github/callback)
//   3. We exchange that code for an access token (server-to-server, secret stays hidden)
//   4. We use the token to fetch the user's profile, upsert them in our DB, save their
//      id to the session, and redirect the browser home
//
// Visual flow:
//   Browser → GET /auth/github → redirect → github.com/login/oauth/authorize
//   Browser ← github.com redirects to → GET /auth/github/callback?code=XYZ
//   Server  → POST github.com/login/oauth/access_token → { access_token }
//   Server  → GET  api.github.com/user (Bearer token) → { id, login, avatar_url }
//   Server  → DB upsert → session.save → redirect /

import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from './db.js'
import { logger } from './logger.js'

// Express Router lets us define a group of related routes here and mount
// them in server.ts with app.use(authRouter). Keeps server.ts clean.
const router = Router()

// ── Step 1: Kick off the OAuth flow ───────────────────────────────────────
// The frontend will link here (or do window.location.href = '/auth/github').
// We immediately redirect to GitHub with our app's client_id and the data
// we're requesting. 'read:user' is the minimum — it gives us the public
// profile (id, username, avatar). We don't ask for email or repo access.
router.get('/auth/github', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? '',
    redirect_uri: process.env.GITHUB_CALLBACK_URL ?? '',
    scope: 'read:user',
  })
  res.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

// ── Step 2: Handle GitHub's redirect back ─────────────────────────────────
// GitHub sends the user back here with a short-lived one-use `code` in the
// query string. We have to exchange it for an access token before it expires
// (usually within 10 minutes).
router.get('/auth/github/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined

  // The user clicked "Deny" on GitHub, or GitHub sent an error.
  if (!code) {
    logger.warn({ query: req.query }, 'GitHub callback arrived without a code')
    res.redirect('/?error=oauth_denied')
    return
  }

  try {
    // ── 2a: Exchange code for access token ────────────────────────────
    // This POST is server-to-server — the browser never sees the client
    // secret or the access token. This is what makes OAuth secure.
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json', // without this, GitHub returns form-encoded text
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      }),
    })

    if (!tokenRes.ok) {
      throw new Error(`GitHub token endpoint returned HTTP ${tokenRes.status}`)
    }

    // GitHub quirk: even when the code is invalid, GitHub returns HTTP 200
    // with a JSON body like { "error": "bad_verification_code" } instead of
    // a 4xx status. So we can't rely on tokenRes.ok alone — we must check
    // for the presence of access_token explicitly.
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string }

    if (!tokenData.access_token) {
      throw new Error(`GitHub returned no access_token: ${tokenData.error ?? 'unknown error'}`)
    }

    // ── 2b: Fetch the user's GitHub profile ───────────────────────────
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json', // GitHub's recommended media type
        'X-GitHub-Api-Version': '2022-11-28', // pin to a stable version
        'User-Agent': 'accessibility-audit-tool',
      },
    })

    if (!userRes.ok) {
      throw new Error(`GitHub user API returned HTTP ${userRes.status}`)
    }

    // We only type the three fields we actually use — TypeScript will error
    // if we try to access anything else, keeping us intentional about what we store.
    const githubUser = (await userRes.json()) as {
      id: number
      login: string
      avatar_url: string
    }

    // ── 2c: Upsert user in our database ───────────────────────────────
    // "Upsert" = INSERT if this githubId doesn't exist yet, UPDATE if it does.
    // This handles first-time login and returning users whose username or
    // avatar may have changed since their last visit.
    const user = await prisma.user.upsert({
      where: { githubId: githubUser.id },
      update: {
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      },
      create: {
        githubId: githubUser.id,
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      },
    })

    // ── 2d: Store identity in the session ─────────────────────────────
    // We store three scalar values — not the entire user object. This keeps
    // the session payload small and avoids accidentally leaking fields we
    // add to the User model later.
    //
    // The session types (userId, username, avatarUrl) are declared via
    // TypeScript declaration merging at the bottom of this file.
    req.session.userId = user.id
    req.session.username = user.username
    req.session.avatarUrl = user.avatarUrl ?? undefined

    // session.save() forces the write to complete before we redirect.
    // Without it there's a race: the redirect can arrive at the browser
    // before the session store has finished persisting the new data,
    // making the next request appear unauthenticated.
    req.session.save((err) => {
      if (err) {
        logger.error({ err }, 'Failed to save session after GitHub login')
        res.redirect('/?error=session_error')
        return
      }
      logger.info({ userId: user.id, username: user.username }, 'User logged in')
      res.redirect('/')
    })
  } catch (err) {
    logger.error({ err }, 'GitHub OAuth callback failed')
    res.redirect('/?error=auth_error')
  }
})

// ── Logout ────────────────────────────────────────────────────────────────
// POST (not GET) intentionally — a GET logout can be triggered by link
// prefetchers or image tags on other sites, which would be a CSRF attack.
// The frontend must send a POST request to log out.
router.post('/auth/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, 'Failed to destroy session on logout')
      res.status(500).json({ error: 'Logout failed' })
      return
    }
    // Clear the cookie on the browser side too.
    // 'sid' must match the `name` option in the session() config in server.ts.
    res.clearCookie('sid')
    res.json({ ok: true })
  })
})

// ── Session status ─────────────────────────────────────────────────────────
// The frontend calls this on app load to check whether the user is already
// logged in (e.g. after a page refresh). Returns the session data or 401.
router.get('/auth/me', (req: Request, res: Response) => {
  if (req.session.userId) {
    res.json({
      userId: req.session.userId,
      username: req.session.username,
      avatarUrl: req.session.avatarUrl ?? null,
    })
  } else {
    // 401 = "you need to authenticate". The frontend should treat this as
    // "not logged in", not as an error to display to the user.
    res.status(401).json({ user: null })
  }
})

export { router as authRouter }

// ── TypeScript: extend express-session's SessionData ──────────────────────
// By default, express-session only types the built-in fields on req.session
// (id, cookie, destroy, etc.). To store our own data without TypeScript
// complaining, we need to tell it what shape we're adding.
//
// This is "declaration merging" — TypeScript lets you re-open an interface
// from another package and add fields to it. The merged result is global
// across the entire compilation, so req.session.userId is correctly typed
// everywhere the session is used, not just in this file.
//
// Rule: this block must live in a file that TypeScript treats as a *module*
// (a file with at least one import or export at the top level). This file
// qualifies because of the `import { Router } from 'express'` above.
declare module 'express-session' {
  interface SessionData {
    userId: number
    username: string
    avatarUrl: string | undefined
  }
}
