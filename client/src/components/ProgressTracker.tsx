// ProgressTracker — shows live pipeline progress via SSE while the audit runs.
//
// React concepts used here:
//   useEffect: runs code AFTER the component appears on screen. We use it to open
//              the SSE connection. The cleanup function (the return value) closes
//              the connection when the component disappears — this prevents memory leaks.
//
//   useState:  tracks which stages are done and whether we hit an error.
//
// SSE in the browser:
//   The browser has a built-in EventSource API for SSE. You create it with a URL,
//   and it fires a 'message' event each time the server sends a "data: ...\n\n" line.
//   It automatically reconnects if the connection drops, which is why we explicitly
//   close it (es.close()) when we're done — we don't want it to keep reconnecting.

import { useEffect, useState } from 'react'
import type { PipelineEvent, AuditReport } from '../types.js'

interface Props {
  auditId: number
  onComplete: (report: AuditReport) => void // called when the pipeline finishes successfully
  onError: (message: string) => void // called if the pipeline fails
}

// The four pipeline stages in order. We track which ones have completed.
const STAGES = [
  {
    key: 'scanning',
    label: 'Scanning page',
    description: 'Fetching and extracting HTML structure',
  },
  {
    key: 'auditing',
    label: 'Auditing for violations',
    description: 'Checking 20+ WCAG 2.1 AA criteria',
  },
  {
    key: 'classifying',
    label: 'Classifying severity',
    description: 'Determining impact level of each issue',
  },
  { key: 'reporting', label: 'Writing report', description: 'Generating summary and code fixes' },
] as const

type StageKey = (typeof STAGES)[number]['key']

export function ProgressTracker({ auditId, onComplete, onError }: Props) {
  // Which stages have finished (status === 'complete')
  const [completedStages, setCompletedStages] = useState<Set<StageKey>>(new Set())

  // Which stage is currently running (status === 'started')
  const [activeStage, setActiveStage] = useState<StageKey | null>(null)

  // useEffect runs after this component mounts (appears on screen).
  // The dependency array [auditId] means: re-run this effect if auditId changes.
  // (In practice auditId never changes once set, but it's correct to declare it.)
  useEffect(() => {
    // Open the SSE stream for this audit
    const es = new EventSource(`/audit/${auditId}/stream`)

    es.onmessage = (event: MessageEvent<string>) => {
      // Each message is a JSON string — parse it into a PipelineEvent.
      // Wrap in try/catch: a malformed message or proxy-injected status line
      // would otherwise throw an uncaught exception and crash the component.
      let pipelineEvent: PipelineEvent
      try {
        pipelineEvent = JSON.parse(event.data) as PipelineEvent
      } catch {
        es.close()
        onError('Received an unexpected response from the server. Please try again.')
        return
      }

      if (pipelineEvent.status === 'started') {
        // A stage just started — mark it as active so we can show the spinner
        setActiveStage(pipelineEvent.stage as StageKey)
      } else if (pipelineEvent.status === 'complete' && pipelineEvent.stage !== 'complete') {
        // A stage finished — add it to the completed set and clear active
        setCompletedStages((prev) => new Set([...prev, pipelineEvent.stage as StageKey]))
        setActiveStage(null)
      } else if (pipelineEvent.stage === 'complete') {
        // The entire pipeline is done — close the stream and call the parent
        es.close()
        const report = pipelineEvent.data as AuditReport
        onComplete(report)
      } else if (pipelineEvent.stage === 'error') {
        // Pipeline failed — close the stream and notify the parent
        es.close()
        const errData = pipelineEvent.data as { message: string }
        onError(errData.message ?? 'Audit failed')
      }
    }

    es.onerror = () => {
      // Network error or server closed the connection unexpectedly
      es.close()
      onError('Lost connection to the server. The audit may still be running — try refreshing.')
    }

    // Cleanup function: runs when this component unmounts (leaves the screen).
    // This is critical — without it, the EventSource stays open in the background
    // forever, even after the user navigates away, accumulating listeners.
    return () => {
      es.close()
    }
  }, [auditId, onComplete, onError])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h2 className="text-white text-2xl font-bold mb-2 text-center">Running Audit</h2>
        <p className="text-gray-400 text-sm text-center mb-10">
          This takes 20–60 seconds. Your report will appear automatically when it's ready.
        </p>

        {/* Stage list */}
        <div className="space-y-4">
          {STAGES.map((stage, index) => {
            const isComplete = completedStages.has(stage.key)
            const isActive = activeStage === stage.key
            // A stage is "upcoming" if nothing has happened with it yet
            const isUpcoming = !isComplete && !isActive

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                  isComplete
                    ? 'border-green-800 bg-green-950'
                    : isActive
                      ? 'border-blue-700 bg-blue-950'
                      : 'border-gray-800 bg-gray-900'
                }`}
              >
                {/* Step number / status icon */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                    isComplete
                      ? 'bg-green-600 text-white'
                      : isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {isComplete ? (
                    // Checkmark SVG
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isActive ? (
                    // Spinner — CSS animation via Tailwind's animate-spin
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Stage text */}
                <div>
                  <div
                    className={`font-medium text-sm ${
                      isComplete ? 'text-green-300' : isActive ? 'text-blue-200' : 'text-gray-500'
                    }`}
                  >
                    {stage.label}
                  </div>
                  {(isActive || isUpcoming) && (
                    <div className="text-gray-600 text-xs mt-0.5">{stage.description}</div>
                  )}
                  {isComplete && <div className="text-green-600 text-xs mt-0.5">Complete</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
