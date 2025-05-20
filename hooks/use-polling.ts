"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { ChatMessage, ChatUser, Chatroom } from "@/lib/redis"

interface PollingResult {
  messages: ChatMessage[]
  usersInRoom: ChatUser[]
  onlineUsers: ChatUser[]
  rooms: Chatroom[]
  isPolling: boolean
  error: Error | null
  sendMessage: (message: ChatMessage) => Promise<boolean>
  updateUser: (user: ChatUser) => Promise<boolean>
}

export function usePolling(interval = 2000, roomId = "general"): PollingResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [usersInRoom, setUsersInRoom] = useState<ChatUser[]>([])
  const [onlineUsers, setOnlineUsers] = useState<ChatUser[]>([])
  const [rooms, setRooms] = useState<Chatroom[]>([])
  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const lastPollTimestamp = useRef<number>(0)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentRoomId = useRef<string>(roomId)

  // Update the current room ID when it changes
  useEffect(() => {
    currentRoomId.current = roomId
  }, [roomId])

  const pollForUpdates = useCallback(async () => {
    try {
      setIsPolling(true)
      const response = await fetch(`/api/poll?since=${lastPollTimestamp.current}&roomId=${currentRoomId.current}`)

      if (!response.ok) {
        throw new Error(`Polling failed with status: ${response.status}`)
      }

      const data = await response.json()

      if (data.messages && Array.isArray(data.messages)) {
        setMessages(data.messages)
      }

      if (data.usersInRoom && Array.isArray(data.usersInRoom)) {
        setUsersInRoom(data.usersInRoom)
      }

      if (data.onlineUsers && Array.isArray(data.onlineUsers)) {
        setOnlineUsers(data.onlineUsers)
      } else if (data.users && Array.isArray(data.users)) {
        // Backward compatibility
        setOnlineUsers(data.users)
      }

      if (data.rooms && Array.isArray(data.rooms)) {
        setRooms(data.rooms)
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
      // Make sure the message has the current room ID
      const messageWithRoom = {
        ...message,
        roomId: currentRoomId.current,
      }

      const response = await fetch("/api/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "message",
          data: messageWithRoom,
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
      // Make sure the user has the current room ID if not specified
      const userWithRoom = {
        ...user,
        currentRoomId: user.currentRoomId || currentRoomId.current,
      }

      const response = await fetch("/api/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "user",
          data: userWithRoom,
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

  return {
    messages,
    usersInRoom,
    onlineUsers,
    rooms,
    isPolling,
    error,
    sendMessage,
    updateUser,
  }
}
