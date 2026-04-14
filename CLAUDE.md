# Claude Code — Project Context

## What this project is

An AI-powered web accessibility auditor. Users paste a URL or upload an HTML file and get a scored report (0–100) with prioritized WCAG violations and AI-generated code fixes.

Four-agent Claude pipeline: Scanner → Auditor → Severity → Reporter

## Developer

Alex Garcia — knows Node.js, Express, TypeScript, Anthropic Claude API, SSE streaming, GitHub OAuth, Prisma. Learning React for the first time.

**Collaboration preferences:**

- Always explain what you're doing, why, and what went wrong when things break
- Small, frequent conventional commits — one thing per commit (`feat:`, `fix:`, `chore:`, etc.)
- Comments in code should explain WHY, not just what the line does

## Environment

- **OS:** Windows 11 Pro
- **Shell:** Git Bash (always use Git Bash, not PowerShell — npx/npm scripts fail in PowerShell)
- **Working directory:** `C:\Users\User\Documents\accessibility-audit-tool`

## Tech stack

| Layer        | Tech                                                  |
| ------------ | ----------------------------------------------------- |
| Frontend     | React 18 + Vite + TypeScript + Tailwind CSS           |
| Backend      | Node.js + Express + TypeScript                        |
| AI           | Anthropic Claude API (4 agents)                       |
| Database     | PostgreSQL via Docker Compose (local), Railway (prod) |
| ORM          | Prisma                                                |
| Auth         | GitHub OAuth + express-session                        |
| Logging      | Pino                                                  |
| Security     | Helmet + express-rate-limit                           |
| Code quality | ESLint + Prettier + Husky                             |

## Project structure

```
accessibility-audit-tool/
├── client/          # React + Vite frontend
├── server/
│   ├── src/
│   │   ├── server.ts    # Express app — security middleware, session, routes
│   │   ├── auth.ts      # GitHub OAuth handlers + session management
│   │   ├── db.ts        # Prisma client singleton
│   │   ├── config.ts    # Claude model assignments per agent
│   │   ├── logger.ts    # Pino logger
│   │   ├── utils.ts     # withRetry helper
│   │   └── agents/      # Claude agent pipeline (Phase 3+)
│   └── prisma/
│       └── schema.prisma  # User, Session, Audit models
└── docker-compose.yml     # PostgreSQL container
```

## Claude model assignments

```typescript
scanner: claude - haiku - 4 - 5 - 20251001 // fast HTML extraction
auditor: claude - sonnet - 4 - 6 // WCAG rule application
severity: claude - haiku - 4 - 5 - 20251001 // violation classification
reporter: claude - sonnet - 4 - 6 // prose report + code fixes
```

## Local dev setup

```bash
# 1. Start Postgres
docker compose up -d

# 2. Start both servers (frontend + backend)
npm run dev
# Backend: http://localhost:3000
# Frontend: http://localhost:5173
```

Requires `server/.env` — copy from `.env.example` and fill in:

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from github.com/settings/developers
- `SESSION_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

## Key API routes

| Route                       | Purpose                               |
| --------------------------- | ------------------------------------- |
| `GET /health`               | Health check (used by Railway/Docker) |
| `GET /auth/github`          | Start GitHub OAuth flow               |
| `GET /auth/github/callback` | OAuth callback — creates session      |
| `POST /auth/logout`         | Destroy session                       |
| `GET /auth/me`              | Return current session user or 401    |

## Build status

- **Phase 1** ✅ — Project scaffolded (client, server, Prisma schema, Docker, lint/hooks)
- **Phase 2** ✅ — GitHub OAuth, Prisma migration, session middleware
- **Phase 3** 🔨 — Four-agent Claude pipeline (Scanner → Auditor → Severity → Reporter)
- **Phase 4** — Frontend (React UI, audit form, results display)
- **Phase 5** — Deploy to Railway
