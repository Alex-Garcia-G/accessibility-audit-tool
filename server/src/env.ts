// env.ts — validates required environment variables at startup.
//
// Import this module before any other server code that reads process.env.
// If a required variable is missing, the process exits immediately with a
// clear list of what's wrong — rather than starting up and crashing later
// with a confusing "Cannot read property of undefined" error.
//
// Why split required vs required-in-production?
//   Some vars have safe dev-only defaults (SESSION_SECRET, CLIENT_URL).
//   Enforcing them locally would break `npm run dev` without a full .env.
//   But in production, using the default SESSION_SECRET would let anyone
//   forge session cookies — so we require them there.

const always = [
  'ANTHROPIC_API_KEY',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_CALLBACK_URL',
  'DATABASE_URL',
] as const

const inProduction = ['SESSION_SECRET', 'CLIENT_URL'] as const

const isProd = process.env.NODE_ENV === 'production'
const required = isProd ? [...always, ...inProduction] : [...always]

const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(
    `\nMissing required environment variables:\n${missing.map((k) => `  • ${k}`).join('\n')}\n\nCheck your .env file or deployment variables (see .env.example).\n`
  )
  process.exit(1)
}

// Export typed values — callers get string instead of string | undefined,
// eliminating the need for non-null assertions or ?? fallbacks at every use site.
export const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID!,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET!,
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL!,
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  CLIENT_URL: process.env.CLIENT_URL ?? 'http://localhost:5173',
  PORT: process.env.PORT ?? '3000',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
}
