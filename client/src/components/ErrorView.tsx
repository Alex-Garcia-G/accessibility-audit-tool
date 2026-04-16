// ErrorView — shown when the audit pipeline fails.
//
// Replaces the raw browser alert() that was used before.
// Purely presentational — receives the error message and a retry callback as props.

interface Props {
  message: string
  onRetry: () => void
}

export function ErrorView({ message, onRetry }: Props) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Error card */}
        <div className="bg-red-950 border border-red-900 rounded-2xl p-8 text-center">
          {/* Icon */}
          <div className="w-14 h-14 bg-red-900 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-7 h-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          <h2 className="text-white text-xl font-bold mb-2">Audit Failed</h2>

          <p className="text-red-300 text-sm leading-relaxed mb-8">{message}</p>

          <button
            onClick={onRetry}
            className="w-full bg-white text-gray-900 font-semibold py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
