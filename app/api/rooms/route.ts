import { type NextRequest, NextResponse } from "next/server"
import {
  createChatroom,
  getChatrooms,
  getChatroom,
  joinChatroom,
  leaveChatroom,
  deleteChatroom,
  type Chatroom,
} from "@/lib/redis"

// GET handler to fetch all chatrooms or a specific chatroom
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("id")

    if (roomId) {
      // Get a specific room
      const room = await getChatroom(roomId)

      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 })
      }

      return NextResponse.json({ room })
    } else {
      // Get all rooms
      const rooms = await getChatrooms()
      return NextResponse.json({ rooms })
    }
  } catch (error) {
    console.error("Error fetching rooms:", error)
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 })
  }
}

// POST handler to create a new chatroom
export async function POST(request: NextRequest) {
  try {
    const { name, description, isPrivate = false, createdBy = "anonymous" } = await request.json()

    // Validate room data
    if (!name || name.trim().length < 3 || name.trim().length > 30) {
      return NextResponse.json({ error: "Room name must be between 3 and 30 characters" }, { status: 400 })
    }

    // Create a URL-friendly ID from the name
    const roomId = name.toLowerCase().replace(/[^a-z0-9]/g, "-")

    const roomData: Omit<Chatroom, "createdAt"> = {
      id: roomId,
      name: name.trim(),
      description: description || "",
      createdBy,
      isPrivate,
      members: [], // Start with no members
    }

    const room = await createChatroom(roomData)

    if (!room) {
      return NextResponse.json({ error: "Failed to create room or room ID already exists" }, { status: 400 })
    }

    return NextResponse.json({ success: true, room })
  } catch (error) {
    console.error("Error creating room:", error)
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 })
  }
}

// PUT handler to join or leave a chatroom
export async function PUT(request: NextRequest) {
  try {
    const { roomId, action, userId } = await request.json()

    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required" }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    if (action === "join") {
      const success = await joinChatroom(roomId, userId)

      if (!success) {
        return NextResponse.json({ error: "Failed to join room" }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: "Joined room successfully" })
    } else if (action === "leave") {
      const success = await leaveChatroom(roomId, userId)

      if (!success) {
        return NextResponse.json({ error: "Failed to leave room" }, { status: 400 })
      }

      return NextResponse.json({ success: true, message: "Left room successfully" })
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error updating room membership:", error)
    return NextResponse.json({ error: "Failed to update room membership" }, { status: 500 })
  }
}

// DELETE handler to delete a chatroom
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("id")
    const userId = searchParams.get("userId")

    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required" }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Get the room to check if the user is the creator
    const room = await getChatroom(roomId)

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    // Only the creator can delete the room
    if (room.createdBy !== userId) {
      return NextResponse.json({ error: "Only the room creator can delete the room" }, { status: 403 })
    }

    const success = await deleteChatroom(roomId)

    if (!success) {
      return NextResponse.json({ error: "Failed to delete room" }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: "Room deleted successfully" })
  } catch (error) {
    console.error("Error deleting room:", error)
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 })
  }
}
