"use client"

import { useEffect, useState } from "react"

type EventCallback = (data: any) => void

export function useSSE(url: string, events: Record<string, EventCallback>) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let heartbeatTimeout: NodeJS.Timeout | null = null

    const connect = () => {
      try {
        // Close any existing connection
        if (eventSource) {
          eventSource.close()
        }

        // Clear any existing timeouts
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
        }
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout)
        }

        // Create EventSource connection
        eventSource = new EventSource(url)
        console.log("Attempting to connect to SSE...")

        // Connection opened
        eventSource.onopen = () => {
          console.log("SSE connection opened")
          setConnected(true)
          setError(null)
        }

        // Connection error
        eventSource.onerror = (e) => {
          console.error("SSE connection error:", e)
          setConnected(false)
          setError(new Error("EventSource connection error"))

          // Try to close the connection
          if (eventSource) {
            eventSource.close()
            eventSource = null
          }

          // Try to reconnect after a delay
          reconnectTimeout = setTimeout(() => {
            console.log("Attempting to reconnect...")
            connect()
          }, 5000)
        }

        // Set up a heartbeat timeout - if we don't get a heartbeat in 30 seconds, reconnect
        const resetHeartbeatTimeout = () => {
          if (heartbeatTimeout) {
            clearTimeout(heartbeatTimeout)
          }
          heartbeatTimeout = setTimeout(() => {
            console.log("Heartbeat timeout, reconnecting...")
            if (eventSource) {
              eventSource.close()
              eventSource = null
            }
            connect()
          }, 30000)
        }

        resetHeartbeatTimeout()

        // Register event handlers
        Object.entries(events).forEach(([event, callback]) => {
          eventSource?.addEventListener(event, (e: MessageEvent) => {
            try {
              if (event === "connected") {
                setConnected(true)
                callback({})
                resetHeartbeatTimeout()
                return
              }

              if (event === "heartbeat") {
                // Reset the heartbeat timeout
                resetHeartbeatTimeout()
                return
              }

              const data = JSON.parse(e.data)
              callback(data)
              resetHeartbeatTimeout()
            } catch (error) {
              console.error(`Error parsing SSE data for event ${event}:`, error)
            }
          })
        })
      } catch (err) {
        console.error("Error setting up SSE:", err)
        setError(err instanceof Error ? err : new Error("Unknown error setting up SSE"))
        setConnected(false)

        // Try to reconnect after a delay
        reconnectTimeout = setTimeout(connect, 5000)
      }
    }

    // Initial connection
    connect()

    // Cleanup function
    return () => {
      if (eventSource) {
        eventSource.close()
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout)
      }
    }
  }, [url])

  return { connected, error }
}
