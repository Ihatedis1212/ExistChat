"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { ChatMessage, ChatUser } from "@/lib/redis"

interface PollingResult {
  messages: ChatMessage[]
  users: ChatUser[]
  isPolling: boolean
  error: Error | null
  sendMessage: (message: ChatMessage) => Promise<boolean>
  updateUser: (user: ChatUser) => Promise<boolean>
}

export function usePolling(interval = 2000): PollingResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [users, setUsers] = useState<ChatUser[]>([])
  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const lastPollTimestamp = useRef<number>(0)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const pollForUpdates = useCallback(async () => {
    try {
      setIsPolling(true)
      const response = await fetch(`/api/poll?since=${lastPollTimestamp.current}`)

      if (!response.ok) {
        throw new Error(`Polling failed with status: ${response.status}`)
      }

      const data = await response.json()

      if (data.messages) {
        setMessages(data.messages)
      }

      if (data.users) {
        setUsers(data.users)
      }

      if (data.timestamp) {
        lastPollTimestamp.current = data.timestamp
      }

      setError(null)
    } catch (err) {
      console.error("Polling error:", err)
      setError(err instanceof Error ? err : new Error("Unknown polling error"))
    } finally {
      setIsPolling(false)

      // Schedule next poll
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
      pollTimeoutRef.current = setTimeout(pollForUpdates, interval)
    }
  }, [interval])

  // Start polling when component mounts
  useEffect(() => {
    pollForUpdates()

    // Cleanup
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [pollForUpdates])

  // Function to send a message
  const sendMessage = async (message: ChatMessage): Promise<boolean> => {
    try {
      const response = await fetch("/api/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "message",
          data: message,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`)
      }

      // Trigger an immediate poll to get the latest messages
      pollForUpdates()
      return true
    } catch (error) {
      console.error("Error sending message:", error)
      return false
    }
  }

  // Function to update user presence
  const updateUser = async (user: ChatUser): Promise<boolean> => {
    try {
      const response = await fetch("/api/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "user",
          data: user,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to update user: ${response.status}`)
      }

      return true
    } catch (error) {
      console.error("Error updating user:", error)
      return false
    }
  }

  return { messages, users, isPolling, error, sendMessage, updateUser }
}
