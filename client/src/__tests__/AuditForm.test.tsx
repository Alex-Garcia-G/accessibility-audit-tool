import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuditForm } from '../components/AuditForm'

vi.mock('../api.js', () => ({
  startUrlAudit: vi.fn().mockResolvedValue(42),
  startFileAudit: vi.fn().mockResolvedValue(42),
}))

// Renders inside a MemoryRouter and captures the current path so we can
// assert navigation without mocking react-router internals.
function LocationCapture() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname}</span>
}

function renderForm() {
  return render(
    <MemoryRouter>
      <AuditForm user={null} onLogout={vi.fn()} />
      <LocationCapture />
    </MemoryRouter>
  )
}

describe('AuditForm', () => {
  it('shows the URL input by default', () => {
    renderForm()
    expect(screen.getByLabelText('Website URL')).toBeInTheDocument()
  })

  it('switches to file input when the HTML File tab is clicked', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'HTML File' }))
    expect(screen.getByLabelText(/HTML File/)).toBeInTheDocument()
  })

  it('shows an error when URL is empty', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a URL')
  })

  it('shows an error when URL lacks http/https', async () => {
    renderForm()
    // ftp:// passes HTML's type="url" validation but fails our custom http/https check
    await userEvent.type(screen.getByLabelText('Website URL'), 'ftp://example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'URL must start with http:// or https://'
    )
  })

  it('navigates to the audit page after a successful submission', async () => {
    renderForm()
    await userEvent.type(screen.getByLabelText('Website URL'), 'https://example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/audit/42')
    })
  })
})
