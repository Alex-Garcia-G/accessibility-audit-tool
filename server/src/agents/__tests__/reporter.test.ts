import { describe, it, expect } from 'vitest'
import { calculateScore } from '../reporter.js'
import type { ViolationWithSeverity } from '../types.js'

// Helper to build a minimal ViolationWithSeverity for testing.
// We only care about the severity field — the other fields don't affect the score.
function v(severity: ViolationWithSeverity['severity']): ViolationWithSeverity {
  return {
    severity,
    wcagCriteria: '1.1.1',
    description: 'test',
    element: '<img>',
    suggestion: 'add alt',
  }
}

describe('calculateScore', () => {
  it('returns 100 for no violations', () => {
    expect(calculateScore([])).toBe(100)
  })

  it('deducts 15 for a single critical violation', () => {
    expect(calculateScore([v('critical')])).toBe(85)
  })

  it('caps critical deductions at 45 (3 violations = max)', () => {
    // 3 critical = -45 (cap), 4+ critical still = -45
    expect(calculateScore([v('critical'), v('critical'), v('critical')])).toBe(55)
    expect(calculateScore([v('critical'), v('critical'), v('critical'), v('critical')])).toBe(55)
  })

  it('caps serious deductions at 32 (4 violations = max)', () => {
    // 4 serious = -32 (cap), 5+ serious still = -32
    const four = [v('serious'), v('serious'), v('serious'), v('serious')]
    const five = [...four, v('serious')]
    expect(calculateScore(four)).toBe(68)
    expect(calculateScore(five)).toBe(68)
  })

  it('caps moderate deductions at 15 (5 violations = max)', () => {
    const five = Array.from({ length: 5 }, () => v('moderate'))
    const ten = Array.from({ length: 10 }, () => v('moderate'))
    expect(calculateScore(five)).toBe(85)
    expect(calculateScore(ten)).toBe(85)
  })

  it('caps minor deductions at 5 (5 violations = max)', () => {
    const five = Array.from({ length: 5 }, () => v('minor'))
    const ten = Array.from({ length: 10 }, () => v('minor'))
    expect(calculateScore(five)).toBe(95)
    expect(calculateScore(ten)).toBe(95)
  })

  it('combines deductions across all severities', () => {
    // 1 critical (-15) + 1 serious (-8) + 1 moderate (-3) + 1 minor (-1) = -27
    const mixed = [v('critical'), v('serious'), v('moderate'), v('minor')]
    expect(calculateScore(mixed)).toBe(73)
  })

  it('never returns a score below 0 (max deductions from all categories)', () => {
    // Max deductions: -45 -32 -15 -5 = -97 → score = 3, not negative
    const worst = [
      ...Array.from({ length: 3 }, () => v('critical')),
      ...Array.from({ length: 4 }, () => v('serious')),
      ...Array.from({ length: 5 }, () => v('moderate')),
      ...Array.from({ length: 5 }, () => v('minor')),
    ]
    expect(calculateScore(worst)).toBe(3)
    // Adding even more violations doesn't go below 3
    const evenWorse = [...worst, v('critical'), v('critical'), v('serious')]
    expect(calculateScore(evenWorse)).toBe(3)
  })
})
