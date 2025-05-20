"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { ChatMessage } from "@/lib/redis"
import { useToast } from "@/hooks/use-toast"

interface UseRoomMessagesResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: Error | null
  sendMessage: (message: Omit<ChatMessage, "id" | "timestamp" | "type">) => Promise<boolean>
}

export function useRoomMessages(roomId: string): UseRoomMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastPollTimestampRef = useRef<number>(0)
  const { toast } = useToast()

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true)

      const response = await fetch(`/api/messages?roomId=${roomId}&since=${lastPollTimestampRef.current}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`)
      }

      const data = await response.json()

      if (data.messages) {
        setMessages(data.messages)
      }

      if (data.timestamp) {
        lastPollTimestampRef.current = data.timestamp
      }

      setError(null)
    } catch (err) {
      console.error("Error fetching messages:", err)
      setError(err instanceof Error ? err : new Error("Failed to fetch messages"))
    } finally {
      setIsLoading(false)

      // Schedule next poll
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
      pollTimeoutRef.current = setTimeout(fetchMessages, 2000)
    }
  }, [roomId])

  const sendMessage = useCallback(
    async (messageData: Omit<ChatMessage, "id" | "timestamp" | "type">): Promise<boolean> => {
      try {
        const message: ChatMessage = {
          ...messageData,
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: "message",
          roomId,
        }

        const response = await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        })

        if (!response.ok) {
          throw new Error(`Failed to send message: ${response.status}`)
        }

        // Optimistically update UI
        setMessages((prev) => [...prev, message])

        // Trigger an immediate fetch to get the latest messages
        fetchMessages()

        return true
      } catch (err) {
        console.error("Error sending message:", err)
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive",
        })
        return false
      }
    },
    [roomId, fetchMessages, toast],
  )

  // Start polling when component mounts or roomId changes
  useEffect(() => {
    // Reset state when room changes
    setMessages([])
    setIsLoading(true)
    setError(null)
    lastPollTimestampRef.current = 0

    fetchMessages()

    // Cleanup
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
  }, [roomId, fetchMessages])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
  }
}
