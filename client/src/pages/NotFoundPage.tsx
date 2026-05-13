import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page Not Found | Accessibility Audit Tool'
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-blue-500 text-sm font-semibold uppercase tracking-widest mb-4">404</p>
        <h1 className="text-white text-3xl font-bold mb-3">Page not found</h1>
        <p className="text-gray-400 text-sm mb-8">The page you're looking for doesn't exist.</p>
        <Link
          to="/new"
          className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          Run an audit
        </Link>
      </div>
    </div>
  )
}
