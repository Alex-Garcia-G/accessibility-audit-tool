import { describe, it, expect, vi } from 'vitest'

// Mock dns/promises before importing the module under test.
// assertPublicUrl calls lookup() to resolve the hostname — we control the
// resolved IP in each test so we can cover every blocked range without
// making real DNS queries.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

// Mock the Anthropic client so importing scanner.ts doesn't try to
// instantiate a real HTTP client during unit tests.
vi.mock('../../anthropic.js', () => ({
  anthropic: { messages: { create: vi.fn() } },
}))

import { assertPublicUrl } from '../scanner.js'
import { lookup } from 'node:dns/promises'

const mockLookup = vi.mocked(lookup)

// Helper — make lookup() resolve to a given IP address
function resolvesTo(ip: string) {
  mockLookup.mockResolvedValue({ address: ip, family: 4 })
}

describe('assertPublicUrl — SSRF protection', () => {
  describe('protocol checks (no DNS needed)', () => {
    it('rejects file:// URLs', async () => {
      await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(
        'Only http and https URLs are supported'
      )
    })

    it('rejects ftp:// URLs', async () => {
      await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow(
        'Only http and https URLs are supported'
      )
    })

    it('allows http:// URLs', async () => {
      resolvesTo('93.184.216.34') // example.com public IP
      await expect(assertPublicUrl('http://example.com')).resolves.toBeUndefined()
    })

    it('allows https:// URLs', async () => {
      resolvesTo('93.184.216.34')
      await expect(assertPublicUrl('https://example.com')).resolves.toBeUndefined()
    })
  })

  describe('hostname checks (before DNS)', () => {
    it('rejects bare localhost', async () => {
      await expect(assertPublicUrl('http://localhost/admin')).rejects.toThrow('private or internal')
    })

    it('rejects 0.0.0.0', async () => {
      await expect(assertPublicUrl('http://0.0.0.0/')).rejects.toThrow('private or internal')
    })
  })

  describe('DNS-resolved IP blocking', () => {
    it('blocks loopback — 127.0.0.1', async () => {
      resolvesTo('127.0.0.1')
      await expect(assertPublicUrl('https://sneaky.example.com')).rejects.toThrow(
        'private or internal'
      )
    })

    it('blocks IPv6 loopback — ::1', async () => {
      mockLookup.mockResolvedValue({ address: '::1', family: 6 })
      await expect(assertPublicUrl('https://sneaky.example.com')).rejects.toThrow(
        'private or internal'
      )
    })

    it('blocks Class A private range — 10.0.0.1', async () => {
      resolvesTo('10.0.0.1')
      await expect(assertPublicUrl('https://internal.example.com')).rejects.toThrow(
        'private or internal'
      )
    })

    it('blocks Class B private range — 172.16.5.10', async () => {
      resolvesTo('172.16.5.10')
      await expect(assertPublicUrl('https://corp.example.com')).rejects.toThrow(
        'private or internal'
      )
    })

    it('blocks upper Class B private range — 172.31.255.254', async () => {
      resolvesTo('172.31.255.254')
      await expect(assertPublicUrl('https://corp.example.com')).rejects.toThrow(
        'private or internal'
      )
    })

    it('allows Class B address just outside the private range — 172.15.0.1', async () => {
      resolvesTo('172.15.0.1')
      await expect(assertPublicUrl('https://example.com')).resolves.toBeUndefined()
    })

    it('blocks Class C private range — 192.168.1.1', async () => {
      resolvesTo('192.168.1.1')
      await expect(assertPublicUrl('https://router.local')).rejects.toThrow('private or internal')
    })

    it('blocks AWS instance metadata endpoint — 169.254.169.254', async () => {
      resolvesTo('169.254.169.254')
      await expect(assertPublicUrl('https://metadata.aws.evil.com')).rejects.toThrow(
        'private or internal'
      )
    })

    it('blocks 0.x.x.x "this network" range', async () => {
      resolvesTo('0.0.0.1')
      await expect(assertPublicUrl('https://example.com')).rejects.toThrow('private or internal')
    })

    it('allows a genuine public IP — 8.8.8.8', async () => {
      resolvesTo('8.8.8.8')
      await expect(assertPublicUrl('https://dns.google')).resolves.toBeUndefined()
    })
  })

  describe('DNS failure handling', () => {
    it('rejects with a clear message when the hostname cannot be resolved', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'))
      await expect(assertPublicUrl('https://nonexistent.invalid')).rejects.toThrow(
        'Could not resolve hostname'
      )
    })
  })
})
