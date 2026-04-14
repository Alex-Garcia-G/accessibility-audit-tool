// Reporter agent — Stage 4 (final stage) of the pipeline.
//
// Responsibility: take the classified violations and produce the final report —
// an accessibility score, an executive summary, code fix examples for the most
// impactful issues, and a list of what passed.
//
// Score calculation is done in TypeScript, not by Claude.
// Reason: math is error-prone for LLMs. A score must be deterministic and
// reproducible — the same violations should always produce the same score.
// We calculate it in code and pass the result to Claude, which uses it in
// the summary prose. Claude only does the creative/prose work it's good at.

import { z } from 'zod'
import { anthropic } from '../anthropic.js'
import { withRetry } from '../utils.js'
import { MODELS } from '../config.js'
import { AuditReportSchema, type ViolationWithSeverity, type AuditReport } from './types.js'

/**
 * Calculates a 0-100 accessibility score from severity counts.
 *
 * Deduction schedule (per-violation penalty + total cap per severity):
 *   critical:  -15 each, capped at -45 total  (3 critical = max deduction)
 *   serious:   -8 each,  capped at -32 total  (4 serious  = max deduction)
 *   moderate:  -3 each,  capped at -15 total  (5 moderate = max deduction)
 *   minor:     -1 each,  capped at -5 total   (5 minor    = max deduction)
 *
 * Rationale for caps: a page with 20 critical violations shouldn't score -200.
 * Caps ensure the score reflects "how bad is this category" not "how many issues
 * did Claude happen to enumerate." The floor is 0 — scores don't go negative.
 */
function calculateScore(violations: ViolationWithSeverity[]): number {
  const counts = violations.reduce<Record<string, number>>((acc, v) => {
    acc[v.severity] = (acc[v.severity] ?? 0) + 1
    return acc
  }, {})

  const deductions =
    Math.min((counts.critical ?? 0) * 15, 45) +
    Math.min((counts.serious ?? 0) * 8, 32) +
    Math.min((counts.moderate ?? 0) * 3, 15) +
    Math.min((counts.minor ?? 0) * 1, 5)

  return Math.max(0, 100 - deductions)
}

export async function runReporter(violations: ViolationWithSeverity[]): Promise<AuditReport> {
  const score = calculateScore(violations)

  // Perfect score — no API call needed. Return a clean pass report.
  if (violations.length === 0) {
    return {
      score: 100,
      summary:
        'No WCAG 2.1 Level AA violations were detected. The page appears to meet ' +
        'accessibility requirements based on the structural HTML analysis.',
      violations: [],
      passedChecks: [
        'Images have appropriate alt text',
        'Form inputs have associated labels',
        'Semantic landmark elements are used correctly',
        'Heading hierarchy appears correct',
        'Links have descriptive text',
      ],
    }
  }

  return withRetry(async () => {
    // Only ask for fix examples on critical and serious violations — these are
    // the ones where a concrete corrected snippet makes the most difference.
    // Generating examples for every minor issue would bloat the response.
    const highPriority = violations
      .map((v, i) => ({ index: i, violation: v }))
      .filter((x) => x.violation.severity === 'critical' || x.violation.severity === 'serious')

    const message = await anthropic.messages.create({
      model: MODELS.reporter,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `You are an accessibility report writer. Produce a JSON report for the violations below.

The accessibility score has already been calculated: ${score}/100
Use this exact score — do not recalculate it.

Your tasks:
1. Write a concise executive summary (2-4 sentences) describing the overall accessibility state
   and the highest-priority issues. Mention the score naturally in the text.
2. For each CRITICAL or SERIOUS violation listed in "highPriorityViolations", write a
   "fixExample" — a corrected HTML snippet showing how to fix that specific element.
   Key the examples by the violation's index in the full violations array.
3. List 3-5 things that appear to be done correctly (passedChecks).

Return ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "summary": "Executive summary here...",
  "fixExamples": { "0": "<corrected html>", "3": "<corrected html>", ... },
  "passedChecks": ["thing that passed", ...]
}

All violations (${violations.length} total):
${JSON.stringify(violations, null, 2)}

High-priority violations needing fix examples:
${JSON.stringify(highPriority, null, 2)}`,
        },
      ],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
    const cleaned = text
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const reporterOutput = z
      .object({
        summary: z.string(),
        fixExamples: z.record(z.string(), z.string()).optional(),
        passedChecks: z.array(z.string()),
      })
      .parse(JSON.parse(cleaned))

    // Merge the fix examples back onto the violations array using the index map.
    // The Reporter returns { "0": "...", "3": "..." } — we use each key as an
    // index into the violations array to attach the right example to each violation.
    const enrichedViolations = violations.map((v, i) => ({
      ...v,
      fixExample: reporterOutput.fixExamples?.[String(i)],
    }))

    return AuditReportSchema.parse({
      score,
      summary: reporterOutput.summary,
      violations: enrichedViolations,
      passedChecks: reporterOutput.passedChecks,
    })
  })
}
