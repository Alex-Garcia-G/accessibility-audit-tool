import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// @testing-library auto-cleanup only registers when jest/vitest globals are on.
// Since we import from 'vitest' explicitly, we wire it up manually here.
afterEach(() => {
  cleanup()
})
