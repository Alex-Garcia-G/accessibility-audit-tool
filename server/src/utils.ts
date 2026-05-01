/**
 * Retries an async function up to `maxAttempts` times with exponential backoff.
 * This protects agent calls from transient API errors — if Claude returns a
 * 529 (overloaded) or a network blip causes a failure, we try again before
 * giving up and showing an error to the user.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        // Exponential backoff with ±25% jitter: 2s, 4s base, randomised each attempt.
        // The jitter prevents a thundering herd when multiple concurrent audits hit
        // the same transient API error and would otherwise all retry at exactly the
        // same moment, causing another burst instead of spreading the load.
        const base = 1000 * 2 ** attempt
        const jitter = base * 0.25 * (Math.random() * 2 - 1)
        await new Promise((res) => setTimeout(res, base + jitter))
      }
    }
  }

  throw lastError
}
