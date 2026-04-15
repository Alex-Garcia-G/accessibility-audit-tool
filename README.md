# Accessibility Audit Tool

An AI-powered web accessibility auditor. Paste a URL or upload an HTML file and get a scored report (0–100) with prioritized WCAG 2.1 violations and AI-generated code fixes — in under a minute.

**Live:** https://accessibility-audit-tool-production.up.railway.app

---

## What it does

1. You submit a URL or HTML file
2. Four Claude AI agents run in sequence, each handing structured data to the next
3. You watch live progress as each stage completes
4. You receive a scored accessibility report with specific violations and corrected code examples

---

## The four-agent pipeline

```
Scanner  (Claude Haiku)   — fetches the page, strips noise, extracts semantic HTML
Auditor  (Claude Sonnet)  — checks 20+ WCAG 2.1 Level AA criteria, returns violations
Severity (Claude Haiku)   — classifies each violation: critical / serious / moderate / minor
Reporter (Claude Sonnet)  — calculates score, writes executive summary, generates code fixes
```

Each agent receives the previous agent's structured output. The score is calculated deterministically in TypeScript — not by Claude — to ensure consistent, reproducible results.

---

## Tech stack

| Layer      | Tech                                                       |
| ---------- | ---------------------------------------------------------- |
| Frontend   | React 18 + Vite + TypeScript + Tailwind CSS                |
| Backend    | Node.js + Express + TypeScript                             |
| AI         | Anthropic Claude API (claude-sonnet-4-6, claude-haiku-4-5) |
| Database   | PostgreSQL + Prisma ORM                                    |
| Auth       | GitHub OAuth + express-session                             |
| Realtime   | Server-Sent Events (SSE)                                   |
| Security   | Helmet + express-rate-limit                                |
| Deployment | Railway                                                    |

---

## Key technical decisions

**Prompt caching on the Auditor agent** — The WCAG system prompt (~600 tokens) is the same for every request. Marking it with `cache_control: { type: "ephemeral" }` gives ~80% latency reduction and 10× cheaper tokens on cache hits.

**Server-Sent Events over WebSockets** — Progress updates only flow server → client, so SSE is simpler and sufficient. No WebSocket handshake overhead, built-in browser reconnect, plain HTTP.

**Score calculated in TypeScript, not by Claude** — Math is error-prone for LLMs. The same violations should always produce the same score. We calculate it in code and pass the result to Claude, which uses it in the summary prose.

**404 before 403 on audit ownership checks** — Returning 403 for a non-existent audit ID would let an attacker enumerate which IDs exist and belong to other users. 404 first leaks nothing.

---

## Running locally

**Prerequisites:** Node.js 20+, Docker Desktop

```bash
# Clone
git clone https://github.com/Alex-Garcia-G/accessibility-audit-tool.git
cd accessibility-audit-tool

# Install dependencies
npm install

# Start PostgreSQL
docker compose up -d

# Configure environment
cp server/.env.example server/.env
# Fill in: ANTHROPIC_API_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET

# Run migrations
npm run db:migrate --prefix server

# Start both servers
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

---

## Project structure

```
accessibility-audit-tool/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── App.tsx           # Root component — view state machine
│       ├── api.ts            # All fetch() calls in one place
│       └── components/
│           ├── LoginPage.tsx
│           ├── AuditForm.tsx
│           ├── ProgressTracker.tsx   # SSE live progress
│           └── AuditReport.tsx       # Final results display
└── server/
    └── src/
        ├── server.ts         # Express app — middleware, routes
        ├── auth.ts           # GitHub OAuth
        ├── audit.ts          # POST /audit, GET /audit/:id, SSE stream
        └── agents/
            ├── pipeline.ts   # Orchestrator + EventEmitter
            ├── scanner.ts
            ├── auditor.ts
            ├── severity.ts
            └── reporter.ts
```
