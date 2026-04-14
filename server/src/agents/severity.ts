// Severity agent — Stage 3 of the pipeline.
//
// Responsibility: take the list of violations from the Auditor and classify
// each one as critical, serious, moderate, or minor.
//
// Why a separate agent for this?
//   We could ask the Auditor to classify severity inline, but keeping it
//   separate improves quality: the Auditor focuses on *finding* violations
//   accurately, while the Severity agent focuses on *ranking* them. Separation
//   of concerns in AI pipelines works the same way as in code.
//
// Why Haiku?
//   Classification is a labeling task with a fixed set of options. It doesn't
//   require deep reasoning — Haiku handles it accurately and is much faster
//   and cheaper than Sonnet for this kind of structured labeling work.

import { z } from 'zod'
import { anthropic } from '../anthropic.js'
import { withRetry } from '../utils.js'
import { MODELS } from '../config.js'
import { ViolationWithSeveritySchema, type Violation, type ViolationWithSeverity } from './types.js'

export async function runSeverity(violations: Violation[]): Promise<ViolationWithSeverity[]> {
  // Skip the API call entirely if there's nothing to classify.
  // An empty page or one with zero violations would waste a round-trip.
  if (violations.length === 0) return []

  return withRetry(async () => {
    const message = await anthropic.messages.create({
      model: MODELS.severity,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are a WCAG severity classifier. Add a "severity" field to each violation.

Severity definitions:
- critical: Completely blocks access for users with disabilities
  Examples: image with no alt text, form input with no label, keyboard trap
- serious: Significant barrier that makes content very difficult to use
  Examples: insufficient color contrast, missing focus indicator, ambiguous button label
- moderate: Noticeable difficulty but workarounds exist
  Examples: ambiguous link text, missing skip-nav, non-descriptive heading
- minor: Best-practice issue with minimal functional impact
  Examples: redundant alt text, missing lang attribute on a page in obvious English

Take the following JSON array and return the SAME array with a "severity" field added to each object.
Do NOT change or omit any existing fields. Only add "severity".

Return ONLY a valid JSON array. No markdown. No explanation.

Violations:
${JSON.stringify(violations, null, 2)}`,
        },
      ],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '[]'
    const cleaned = text
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    return z.array(ViolationWithSeveritySchema).parse(JSON.parse(cleaned))
  })
}
