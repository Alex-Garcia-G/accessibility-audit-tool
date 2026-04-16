// ErrorBoundary — catches unhandled errors thrown by any child component
// and renders a fallback UI instead of a blank screen.
//
// Why a class component? React's error boundary API requires getDerivedStateFromError
// and/or componentDidCatch, which are lifecycle methods only available in class
// components. There is no function-component equivalent as of React 18.

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  // Called during rendering when a descendant throws. Updates state so the
  // next render shows the fallback instead of crashing the whole tree.
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <h1 className="text-white text-2xl font-bold mb-3">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6">
              {this.state.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              Refresh page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
