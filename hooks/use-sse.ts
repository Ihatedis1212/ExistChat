"use client"

import { useEffect, useState } from "react"

type EventCallback = (data: any) => void

export function useSSE(url: string, events: Record<string, EventCallback>) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      // Create EventSource connection
      eventSource = new EventSource(url)

      // Connection opened
      eventSource.onopen = () => {
        setConnected(true)
        setError(null)
      }

      // Connection error
      eventSource.onerror = (e) => {
        setConnected(false)
        setError(new Error("EventSource connection error"))

        // Try to close the connection
        if (eventSource) {
          eventSource.close()
        }
      }

      // Register event handlers
      Object.entries(events).forEach(([event, callback]) => {
        eventSource?.addEventListener(event, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data)
            callback(data)
          } catch (error) {
            console.error(`Error parsing SSE data for event ${event}:`, error)
          }
        })
      })
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error setting up SSE"))
      setConnected(false)
    }

    // Cleanup function
    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [url])

  return { connected, error }
}
