# Contributing

## Local setup

**Prerequisites:** Node.js 20, Docker Desktop

```bash
# 1. Clone the repo
git clone https://github.com/Alex-Garcia-G/accessibility-audit-tool.git
cd accessibility-audit-tool

# 2. Start Postgres
docker compose up -d

# 3. Configure environment
cp server/.env.example server/.env
# Edit server/.env and fill in:
#   ANTHROPIC_API_KEY  — https://console.anthropic.com/settings/api-keys
#   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET  — https://github.com/settings/developers
#   SESSION_SECRET  — any long random string

# 4. Install dependencies
npm install --prefix server
npm install --prefix client

# 5. Run database migrations
npm run db:migrate --prefix server

# 6. Start both servers
npm run dev
# Backend:  http://localhost:3000
# Frontend: http://localhost:5173
```

## Running tests

```bash
# Server (35 tests)
npm test --prefix server

# Client (9 tests)
npm test --prefix client
```

All tests must pass before opening a pull request.

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

**Types:** `feat` · `fix` · `chore` · `docs` · `refactor` · `test` · `style` · `perf`

**Scopes:** `server` · `client` · `agents` · `auth` · `db` · `ci` · `deps`

Examples:

- `feat(client): add pagination to history page`
- `fix(agents): handle empty HTML response from scanner`
- `test(server): add unit tests for rate limiter`

Rules:

- Summary is lowercase, no trailing period, 72 characters max
- One logical change per commit
- Breaking changes: add `!` after scope — `feat(server)!: rename endpoint`

## Pull request checklist

- [ ] `npm run lint --prefix server` passes
- [ ] `npm run lint --prefix client` passes
- [ ] `npm test --prefix server` passes
- [ ] `npm test --prefix client` passes
- [ ] New behaviour is covered by tests
- [ ] Commit messages follow the convention above
