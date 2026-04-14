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
        // Wait 2^attempt seconds: 2s, 4s, 8s — gives the API time to recover
        await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt))
      }
    }
  }

  throw lastError
}
