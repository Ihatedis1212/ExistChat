"use client"

import { useState, useEffect, useCallback } from "react"
import type { Chatroom } from "@/lib/redis"
import { useToast } from "@/hooks/use-toast"

interface UseRoomsResult {
  rooms: Chatroom[]
  currentRoom: Chatroom | null
  isLoading: boolean
  error: Error | null
  fetchRooms: () => Promise<void>
  selectRoom: (roomId: string) => Promise<boolean>
  createRoom: (name: string, description: string, isPrivate: boolean) => Promise<Chatroom | null>
}

export function useRooms(): UseRoomsResult {
  const [rooms, setRooms] = useState<Chatroom[]>([])
  const [currentRoom, setCurrentRoom] = useState<Chatroom | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { toast } = useToast()

  const fetchRooms = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch("/api/rooms")

      if (!response.ok) {
        throw new Error(`Failed to fetch rooms: ${response.status}`)
      }

      const data = await response.json()

      if (data.rooms) {
        setRooms(data.rooms)

        // If we don't have a current room yet, select the first one
        if (!currentRoom && data.rooms.length > 0) {
          setCurrentRoom(data.rooms[0])
        }
      }
    } catch (err) {
      console.error("Error fetching rooms:", err)
      setError(err instanceof Error ? err : new Error("Failed to fetch rooms"))
      toast({
        title: "Error",
        description: "Failed to fetch chat rooms. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentRoom, toast])

  const selectRoom = useCallback(
    async (roomId: string): Promise<boolean> => {
      try {
        // Find the room in our local state
        const room = rooms.find((r) => r.id === roomId)

        if (!room) {
          // Try to fetch the room from the server
          const response = await fetch(`/api/rooms?id=${roomId}`)

          if (!response.ok) {
            throw new Error(`Room not found: ${roomId}`)
          }

          const data = await response.json()

          if (data.room) {
            setCurrentRoom(data.room)
            return true
          } else {
            throw new Error(`Room not found: ${roomId}`)
          }
        }

        // Join the room
        const response = await fetch("/api/rooms", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId,
            action: "join",
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to join room: ${response.status}`)
        }

        setCurrentRoom(room)
        return true
      } catch (err) {
        console.error("Error selecting room:", err)
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to select room",
          variant: "destructive",
        })
        return false
      }
    },
    [rooms, toast],
  )

  const createRoom = useCallback(
    async (name: string, description: string, isPrivate: boolean): Promise<Chatroom | null> => {
      try {
        const response = await fetch("/api/rooms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            description,
            isPrivate,
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to create room: ${response.status}`)
        }

        const data = await response.json()

        if (data.room) {
          // Refresh the room list
          await fetchRooms()
          return data.room
        }

        return null
      } catch (err) {
        console.error("Error creating room:", err)
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to create room",
          variant: "destructive",
        })
        return null
      }
    },
    [fetchRooms, toast],
  )

  // Fetch rooms on component mount
  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  return {
    rooms,
    currentRoom,
    isLoading,
    error,
    fetchRooms,
    selectRoom,
    createRoom,
  }
}
