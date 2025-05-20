"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CreateRoomDialog } from "@/components/create-room-dialog"
import { useToast } from "@/hooks/use-toast"
import { Hash, Lock, Users } from "lucide-react"
import type { Chatroom } from "@/lib/redis"

interface RoomListProps {
  rooms: Chatroom[]
  currentRoomId: string
  onRoomSelect: (roomId: string) => void
  onRoomsRefresh: () => void
  userId: string
}

export function RoomList({ rooms, currentRoomId, onRoomSelect, onRoomsRefresh, userId }: RoomListProps) {
  const [isJoining, setIsJoining] = useState<string | null>(null)
  const { toast } = useToast()

  const handleJoinRoom = async (roomId: string) => {
    try {
      setIsJoining(roomId)

      const response = await fetch("/api/rooms", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          action: "join",
          userId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to join room")
      }

      // Switch to the joined room
      onRoomSelect(roomId)

      toast({
        title: "Room joined",
        description: `You have joined the room successfully`,
      })
    } catch (error) {
      console.error("Error joining room:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to join room",
        variant: "destructive",
      })
    } finally {
      setIsJoining(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">Chat Rooms</h3>
        <CreateRoomDialog onRoomCreated={onRoomsRefresh} />
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-1">
          {rooms.map((room) => (
            <Button
              key={room.id}
              variant={currentRoomId === room.id ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => currentRoomId !== room.id && handleJoinRoom(room.id)}
              disabled={isJoining === room.id}
            >
              <div className="flex items-center w-full">
                <div className="mr-2">
                  {room.isPrivate ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                </div>
                <div className="flex-1 truncate">
                  <div className="text-sm font-medium">{room.name}</div>
                  {room.description && <div className="text-xs text-gray-500 truncate">{room.description}</div>}
                </div>
                {isJoining === room.id ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500"></div>
                ) : (
                  <div className="flex items-center text-xs text-gray-500">
                    <Users className="h-3 w-3 mr-1" />
                    <span>{room.members.length}</span>
                  </div>
                )}
              </div>
            </Button>
          ))}

          {rooms.length === 0 && <div className="text-center py-4 text-sm text-gray-500">No rooms available</div>}
        </div>
      </ScrollArea>
    </div>
  )
}
