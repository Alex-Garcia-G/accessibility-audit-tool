import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuditReport } from '../components/AuditReport'
import type { AuditReport as AuditReportType, CurrentUser } from '../types'

const sampleReport: AuditReportType = {
  score: 72,
  summary: 'This page has some accessibility issues that should be addressed.',
  violations: [
    {
      wcagCriteria: '1.1.1 Non-text Content',
      description: 'Image is missing alt text',
      element: '<img src="logo.png">',
      suggestion: 'Add a descriptive alt attribute to the image.',
      severity: 'serious',
      fixExample: '<img src="logo.png" alt="Company logo">',
    },
  ],
  passedChecks: ['Color contrast meets AA standards'],
}

const loggedInUser: CurrentUser = { userId: 1, username: 'testuser', avatarUrl: null }

function renderReport(user: CurrentUser | null = null) {
  return render(
    <MemoryRouter>
      <AuditReport report={sampleReport} inputLabel="https://example.com" user={user} />
    </MemoryRouter>
  )
}

describe('AuditReport', () => {
  it('shows the sign-in CTA when the user is not logged in', () => {
    renderReport(null)
    expect(screen.getByText(/Sign in to save your audit history/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in with GitHub' })).toBeInTheDocument()
  })

  it('hides the sign-in CTA when the user is logged in', () => {
    renderReport(loggedInUser)
    expect(screen.queryByText(/Sign in to save your audit history/)).not.toBeInTheDocument()
  })

  it('displays the accessibility score', () => {
    renderReport()
    expect(screen.getByText('72')).toBeInTheDocument()
  })

  it('displays violation descriptions', () => {
    renderReport()
    expect(screen.getByText('Image is missing alt text')).toBeInTheDocument()
  })
})
