/**
 * Model assignments per agent role.
 *
 *  Scanner   — simple HTML extraction, no deep reasoning needed → Haiku (fast + cheap)
 *  Auditor   — must know WCAG criteria and apply them correctly → Sonnet
 *  Severity  — classification task, structured input → Haiku
 *  Reporter  — writes prose + generates corrected code examples → Sonnet
 */
export const MODELS = {
  scanner: 'claude-haiku-4-5-20251001',
  auditor: 'claude-sonnet-4-6',
  severity: 'claude-haiku-4-5-20251001',
  reporter: 'claude-sonnet-4-6',
} as const
