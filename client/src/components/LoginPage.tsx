// LoginPage — shown when the user is not authenticated.
//
// React concepts used here:
//   - No state needed — this component has no interactive data of its own.
//     It's purely presentational: show a button, and when clicked, redirect.
//   - Props: the parent (App.tsx) passes data down via props, like function arguments.
//     This component receives no props — it stands alone.
//
// The "Sign in with GitHub" button navigates to /auth/github on the backend.
// That URL redirects the browser to GitHub's OAuth page. We use window.location.href
// instead of a React link because we're leaving the frontend entirely — going to github.com.

export function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      {/* App header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-3">Accessibility Audit Tool</h1>
        <p className="text-gray-400 text-lg max-w-md">
          AI-powered WCAG 2.1 AA audits. Paste a URL or upload an HTML file and get a scored report
          with code fixes in under a minute.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-6 mb-12 max-w-lg">
        <div className="text-center">
          <div className="text-2xl mb-2">🔍</div>
          <div className="text-gray-300 text-sm font-medium">Deep Analysis</div>
          <div className="text-gray-500 text-xs mt-1">20+ WCAG criteria checked</div>
        </div>
        <div className="text-center">
          <div className="text-2xl mb-2">⚡</div>
          <div className="text-gray-300 text-sm font-medium">Fast Results</div>
          <div className="text-gray-500 text-xs mt-1">Under 60 seconds</div>
        </div>
        <div className="text-center">
          <div className="text-2xl mb-2">🛠️</div>
          <div className="text-gray-300 text-sm font-medium">Code Fixes</div>
          <div className="text-gray-500 text-xs mt-1">AI-generated snippets</div>
        </div>
      </div>

      {/* Sign in button */}
      {/* window.location.href replaces the current URL — navigates to the backend OAuth route */}
      <button
        onClick={() => {
          window.location.href = '/auth/github'
        }}
        className="flex items-center gap-3 bg-white text-gray-900 font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors"
      >
        {/* GitHub SVG icon */}
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </svg>
        Sign in with GitHub
      </button>

      <p className="text-gray-600 text-xs mt-6">
        We only request your public GitHub profile. No repo access.
      </p>
    </div>
  )
}
