// ESLint v9+ uses "flat config" — a single JS file instead of .eslintrc.json.
// typescript-eslint is the unified package that connects TypeScript type-checking
// to ESLint rules. It replaces the old @typescript-eslint/parser + plugin combo.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Don't lint generated files or build output
    ignores: ['**/dist/**', '**/node_modules/**', 'client/eslint.config.js'],
  }
)
