// Scanner agent — Stage 1 of the pipeline.
//
// Responsibility: get HTML from either a URL or a file upload, then ask
// Claude Haiku to strip everything that isn't relevant to accessibility
// (scripts, styles, SVG decorations) and return just the semantic structure.
//
// Why do this stripping step at all?
//   A real webpage can be 500KB+ of HTML. Sending that raw to the Auditor
//   would waste tokens on CSS class lists, inline scripts, and SVG path data
//   that contain zero accessibility information. Stripping here means the
//   Auditor sees a cleaner, smaller document and can focus on what matters.
//
// Why use Claude for this instead of just using a regex/parser?
//   Claude can identify which elements are semantically meaningful in context
//   (e.g., it recognizes an aria-labelledby reference chain) in ways that
//   a simple DOM traversal can't. Haiku is fast and cheap enough that this
//   is worth the API call.

import { anthropic } from '../anthropic.js'
import { withRetry } from '../utils.js'
import { MODELS } from '../config.js'
import { ScanResultSchema, type ScanResult } from './types.js'

export type ScannerInput = { type: 'url'; url: string } | { type: 'file'; html: string }

export async function runScanner(input: ScannerInput): Promise<ScanResult> {
  // ── Step 1: Obtain raw HTML ──────────────────────────────────────────────
  let rawHtml: string
  let inputLabel: string

  if (input.type === 'url') {
    inputLabel = input.url

    // AbortController lets us cancel the fetch after 10 seconds.
    // Without a timeout, a slow or unresponsive target site would hold the
    // pipeline open indefinitely, blocking the user and consuming a server
    // connection. 10s is generous for a page load — if a site is slower than
    // that, it almost certainly has performance problems alongside accessibility ones.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(input.url, { signal: controller.signal })
      if (!res.ok) throw new Error(`Failed to fetch URL: HTTP ${res.status}`)
      rawHtml = await res.text()
    } finally {
      // Always clear the timeout — if fetch succeeded quickly, we don't want
      // the timeout to fire later and abort an unrelated request.
      clearTimeout(timeout)
    }
  } else {
    // File upload path — the HTML is already in memory from multer
    inputLabel = 'uploaded-file.html'
    rawHtml = input.html
  }

  // ── Step 2: Claude extracts accessibility-relevant structure ─────────────
  // We ask for JSON output so the result is machine-readable. Haiku is used
  // here because extraction is a structural task, not a reasoning task.
  return withRetry(async () => {
    const message = await anthropic.messages.create({
      model: MODELS.scanner,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are an HTML preprocessor for a WCAG accessibility auditing tool.

Extract ONLY the elements relevant to accessibility from the HTML below.

KEEP:
- Headings: h1, h2, h3, h4, h5, h6
- Images: img (with src, alt attributes)
- Links: a (with href, text content)
- Buttons and interactive controls
- Form elements: form, input, label, select, textarea, fieldset, legend
- Landmark elements: header, nav, main, footer, aside, section, article
- Any element with aria-* or role attributes
- The page <title>

REMOVE completely:
- All <script> tags and their contents
- All <style> tags and their contents
- All <svg> elements
- Inline event handlers (onclick, onmouseover, etc.)
- CSS class attributes (class="...") — they add noise without accessibility value

Respond ONLY with valid JSON in this exact shape — no markdown, no explanation:
{"title": "the page title text", "html": "the cleaned HTML here"}

HTML TO PROCESS:
${rawHtml.slice(0, 150_000)}`,
          // Slice to 150k chars as a safety limit — this keeps token usage
          // predictable and prevents enormous pages from exceeding context windows.
          // Real accessibility-relevant content is almost always in the first 150k chars.
        },
      ],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''

    // Claude reliably adds ```json fences despite being told not to.
    // Strip them before parsing — this is a known quirk that affects all models.
    const cleaned = text
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()
    const parsed = JSON.parse(cleaned) as { title?: string; html?: string }

    return ScanResultSchema.parse({
      html: parsed.html ?? rawHtml,
      title: parsed.title ?? '',
      inputType: input.type,
      inputLabel,
    })
  })
}
