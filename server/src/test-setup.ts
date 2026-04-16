// Fake env vars required by env.ts — prevents process.exit(1) during tests.
// These values are never used (agents are mocked), but env.ts validates keys
// at module load time before any test code runs, so they must be present.
process.env.ANTHROPIC_API_KEY = 'test-key'
process.env.GITHUB_CLIENT_ID = 'test-client-id'
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/auth/github/callback'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
