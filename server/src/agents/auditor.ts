// Auditor agent — Stage 2 of the pipeline.
//
// Responsibility: apply WCAG 2.1 Level AA rules to the cleaned HTML from the
// Scanner and return a list of specific violations.
//
// This is the most important agent — it's where the actual accessibility
// knowledge lives. We use Sonnet because this task requires genuine reasoning:
// understanding what WCAG criteria mean, recognizing when HTML patterns violate
// them, and describing the problem precisely enough to be actionable.
//
// Prompt caching:
//   The WCAG system prompt is ~700 tokens and identical for every single audit.
//   By marking it with cache_control: { type: 'ephemeral' }, we tell Anthropic's
//   infrastructure to store this prefix in a 5-minute cache. Cache hits are:
//   - ~80% faster (the cached tokens are not reprocessed)
//   - ~10× cheaper (cached input tokens cost 0.1× the normal rate)
//   Since every audit goes through this same system prompt, production cache
//   hit rates will be very high — this is a significant cost/latency win.

import { z } from 'zod'
import { anthropic } from '../anthropic.js'
import { withRetry } from '../utils.js'
import { MODELS } from '../config.js'
import { ViolationSchema, type ScanResult, type Violation } from './types.js'

// The WCAG system prompt is a constant — it never changes between requests.
// Keeping it as a module-level const means it's defined once, and the same
// string reference is used for every audit, which maximizes cache hits
// (the cache key is derived from the content, so identical content = cache hit).
const AUDITOR_SYSTEM_PROMPT = `You are an expert web accessibility auditor with deep knowledge of WCAG 2.1 Level AA guidelines.

Analyze the provided HTML structure and identify all accessibility violations.

For each violation, return a JSON object with EXACTLY these four fields:
- wcagCriteria: the specific WCAG criterion violated, e.g. "1.1.1 Non-text Content (Level A)"
- description: a precise description of the specific problem found in this HTML
- element: the exact HTML snippet containing the violation (keep it short — just the relevant element)
- suggestion: a clear, actionable recommendation to fix this specific issue

WCAG 2.1 Level AA criteria to check:

PERCEIVABLE
1.1.1 Non-text Content — images must have alt text; decorative images use alt=""
1.3.1 Info and Relationships — use semantic HTML; headings/lists/tables must be structured correctly
1.3.2 Meaningful Sequence — reading order must make sense without CSS
1.3.3 Sensory Characteristics — instructions must not rely on shape, color, size, or position alone
1.4.1 Use of Color — color must not be the only means of conveying information
1.4.3 Contrast (Minimum) — text needs 4.5:1 ratio (3:1 for large text 18pt+ or 14pt+ bold)
1.4.4 Resize Text — text must resize to 200% without loss of content or functionality
1.4.5 Images of Text — use real text rather than images of text where possible
1.4.10 Reflow — content must be readable at 320px width without horizontal scrolling
1.4.11 Non-text Contrast — UI components need 3:1 contrast ratio against adjacent colors
1.4.12 Text Spacing — no loss of content when line-height/letter-spacing/word-spacing increased
1.4.13 Content on Hover or Focus — hoverable/focusable content must be dismissable and persistent

OPERABLE
2.1.1 Keyboard — all functionality must be available via keyboard
2.1.2 No Keyboard Trap — keyboard focus must not become trapped
2.4.1 Bypass Blocks — skip navigation links required for repeated content
2.4.2 Page Titled — pages must have descriptive, unique <title> elements
2.4.3 Focus Order — tab order must be logical and meaningful
2.4.4 Link Purpose — link text must describe the destination (avoid "click here", "read more")
2.4.6 Headings and Labels — headings and labels must be descriptive
2.4.7 Focus Visible — keyboard focus indicator must be visible

UNDERSTANDABLE
3.1.1 Language of Page — <html> element must have a lang attribute
3.2.1 On Focus — focus must not trigger unexpected context changes
3.3.1 Error Identification — form errors must be identified and described in text
3.3.2 Labels or Instructions — all form inputs must have associated labels

ROBUST
4.1.1 Parsing — HTML must be valid (no duplicate IDs, properly nested elements)
4.1.2 Name, Role, Value — all UI components must have accessible name, role, and state
4.1.3 Status Messages — status messages must be programmatically determinable (role="status" etc.)

Return ONLY a JSON array of violation objects. No markdown fences. No explanation. No wrapper object.
If you find no violations, return an empty array: []`

export async function runAuditor(scanResult: ScanResult): Promise<Violation[]> {
  return withRetry(async () => {
    const message = await anthropic.messages.create({
      model: MODELS.auditor,
      max_tokens: 8192,
      // system as an array (not a plain string) is required to attach cache_control.
      // The Anthropic SDK accepts: system?: string | Array<TextBlockParam>
      // Using the array form lets us tag individual blocks for caching.
      system: [
        {
          type: 'text',
          text: AUDITOR_SYSTEM_PROMPT,
          // ephemeral cache: stored for up to 5 minutes on Anthropic's servers.
          // Every audit that runs within that window gets a cache hit on this block.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Audit this HTML for WCAG 2.1 Level AA violations.

Page title: ${scanResult.title}
Source: ${scanResult.inputType === 'url' ? scanResult.inputLabel : 'uploaded HTML file'}

HTML:
${scanResult.html}`,
        },
      ],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '[]'
    const cleaned = text
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    // z.array(ViolationSchema).parse() validates every item in the array.
    // If Claude misnames a field or omits a required one, Zod throws a ZodError
    // with a clear message like "Required at [0].wcagCriteria".
    // withRetry catches that error and retries the API call automatically.
    return z.array(ViolationSchema).parse(JSON.parse(cleaned))
  })
}
