import Anthropic from '@anthropic-ai/sdk'

// Single Anthropic client instance — same pattern as db.ts with Prisma.
// Node's module cache ensures every file that imports this gets the same object.
//
// maxRetries: 0 disables the SDK's built-in retry logic.
// We use our own withRetry() wrapper (utils.ts) instead, so that DB status
// updates and structured logging happen on each attempt. Letting both systems
// retry independently could produce up to 9 silent attempts — not what we want.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 0,
})

export { anthropic }
