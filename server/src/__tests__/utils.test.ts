import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry } from '../utils.js'

describe('withRetry', () => {
  beforeEach(() => {
    // Fake timers so tests don't actually sleep through the backoff delays
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the result immediately when the function succeeds on the first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries after a failure and returns the result on the second attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce('recovered')

    const promise = withRetry(fn)
    // Advance past the first backoff delay so the retry fires
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('re-throws the final error after exhausting all attempts', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('attempt 1'))
      .mockRejectedValueOnce(new Error('attempt 2'))
      .mockRejectedValueOnce(new Error('still failing'))

    // Attach the rejection handler BEFORE running timers so Node never sees an
    // unhandled rejection (the handler is registered at the microtask checkpoint).
    const assertion = expect(withRetry(fn)).rejects.toThrow('still failing')
    await vi.runAllTimersAsync()
    await assertion

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects a custom maxAttempts value', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))

    const assertion = expect(withRetry(fn, 2)).rejects.toThrow('always fails')
    await vi.runAllTimersAsync()
    await assertion

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('succeeds on the third attempt after two failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce(42)

    const promise = withRetry(fn)
    await vi.runAllTimersAsync()

    expect(await promise).toBe(42)
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
