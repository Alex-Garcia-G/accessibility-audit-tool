import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock() is hoisted by Vitest to before imports, so module resolution
// happens at test startup before any code in this file runs.

vi.mock('../../db.js', () => ({
  prisma: {
    audit: {
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('../scanner.js', () => ({
  runScanner: vi.fn(),
}))

vi.mock('../auditor.js', () => ({
  runAuditor: vi.fn(),
}))

vi.mock('../severity.js', () => ({
  runSeverity: vi.fn(),
}))

vi.mock('../reporter.js', () => ({
  runReporter: vi.fn(),
}))

// Silence logger output during tests — we don't need to assert on log calls
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { runPipeline, auditEmitter, type PipelineEvent } from '../pipeline.js'
import { runScanner } from '../scanner.js'
import { runAuditor } from '../auditor.js'
import { runSeverity } from '../severity.js'
import { runReporter } from '../reporter.js'
import { prisma } from '../../db.js'

// Typed references to the mocked functions
const mockRunScanner = vi.mocked(runScanner)
const mockRunAuditor = vi.mocked(runAuditor)
const mockRunSeverity = vi.mocked(runSeverity)
const mockRunReporter = vi.mocked(runReporter)
const mockUpdate = vi.mocked(prisma.audit.update)

// Fixtures shared across tests
const SCAN_RESULT = {
  html: '<html><body><img src="x.jpg"></body></html>',
  title: 'Test Page',
  inputType: 'url' as const,
  inputLabel: 'https://example.com',
}
const VIOLATIONS = [
  {
    wcagCriteria: '1.1.1 Non-text Content',
    description: 'Image missing alt text',
    element: '<img src="x.jpg">',
    suggestion: 'Add a descriptive alt attribute',
  },
]
const VIOLATIONS_WITH_SEVERITY = [{ ...VIOLATIONS[0], severity: 'serious' as const }]
const REPORT = {
  score: 92,
  summary: 'One serious issue found.',
  violations: VIOLATIONS_WITH_SEVERITY.map((v) => ({ ...v, fixExample: undefined })),
  passedChecks: ['Heading hierarchy correct'],
}

describe('runPipeline', () => {
  beforeEach(() => {
    mockRunScanner.mockResolvedValue(SCAN_RESULT)
    mockRunAuditor.mockResolvedValue(VIOLATIONS)
    mockRunSeverity.mockResolvedValue(VIOLATIONS_WITH_SEVERITY)
    mockRunReporter.mockResolvedValue(REPORT)
    mockUpdate.mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls all four agents in order with the correct inputs', async () => {
    await runPipeline({ type: 'url', url: 'https://example.com' }, 1, 10)

    expect(mockRunScanner).toHaveBeenCalledWith({ type: 'url', url: 'https://example.com' })
    expect(mockRunAuditor).toHaveBeenCalledWith(SCAN_RESULT)
    expect(mockRunSeverity).toHaveBeenCalledWith(VIOLATIONS)
    expect(mockRunReporter).toHaveBeenCalledWith(VIOLATIONS_WITH_SEVERITY)
  })

  it('saves complete status, score, and report to the database', async () => {
    await runPipeline({ type: 'url', url: 'https://example.com' }, 1, 10)

    // The final DB write should contain status, score, and the full result
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          status: 'complete',
          score: REPORT.score,
          result: REPORT,
        }),
      })
    )
  })

  it('emits a progress event for each stage including the final complete event', async () => {
    const events: PipelineEvent[] = []
    const listener = (e: PipelineEvent) => events.push(e)
    auditEmitter.on('10', listener)

    await runPipeline({ type: 'url', url: 'https://example.com' }, 1, 10)

    auditEmitter.off('10', listener)

    const stages = events.map((e) => e.stage)
    expect(stages).toContain('scanning')
    expect(stages).toContain('auditing')
    expect(stages).toContain('classifying')
    expect(stages).toContain('reporting')
    expect(stages).toContain('complete')
  })

  it('marks the audit as error in the database when an agent throws', async () => {
    mockRunScanner.mockRejectedValue(new Error('Network timeout'))

    await runPipeline({ type: 'url', url: 'https://example.com' }, 1, 99)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: { status: 'error' },
      })
    )
  })

  it('emits an error event with the failure message when the pipeline fails', async () => {
    mockRunScanner.mockRejectedValue(new Error('Network timeout'))

    const events: PipelineEvent[] = []
    const listener = (e: PipelineEvent) => events.push(e)
    auditEmitter.on('99', listener)

    await runPipeline({ type: 'url', url: 'https://example.com' }, 1, 99)

    auditEmitter.off('99', listener)

    const errorEvent = events.find((e) => e.stage === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.data).toMatchObject({ message: 'Network timeout' })
  })
})
