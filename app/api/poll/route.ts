import { type NextRequest, NextResponse } from "next/server"
import { getMessages, getUsers, addMessage, updateUser, deleteOldMessages, type ChatMessage } from "@/lib/redis"

// Track when we last cleaned up old messages
let lastCleanupTime = 0
const CLEANUP_INTERVAL = 5 * 60 * 1000 // Clean up every 5 minutes

// Enhanced polling endpoint that handles all operations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get("since") || "0"
    const sinceTimestamp = Number.parseInt(since, 10)

    // Periodically clean up old messages
    const now = Date.now()
    if (now - lastCleanupTime > CLEANUP_INTERVAL) {
      console.log("Cleaning up old messages...")
      try {
        await deleteOldMessages()
        lastCleanupTime = now
      } catch (error) {
        console.error("Error during message cleanup:", error)
      }
    }

    // Fetch messages and handle potential errors
    let messages = []
    try {
      messages = await getMessages()
    } catch (error) {
      console.error("Error fetching messages:", error)
      messages = []
    }

    // Fetch users and handle potential errors
    let users = []
    try {
      users = await getUsers()
    } catch (error) {
      console.error("Error fetching users:", error)
      users = []
    }

    // Filter users who were active in the last 2 minutes
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000
    const onlineUsers = users.filter((user) => user.lastSeen > twoMinutesAgo)

    // Filter messages that are newer than the since timestamp
    const newMessages = messages.filter((msg) => msg.timestamp > sinceTimestamp)

    return NextResponse.json({
      messages: messages,
      newMessages: newMessages,
      users: onlineUsers,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error("Error in polling endpoint:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch updates",
        messages: [],
        users: [],
        timestamp: Date.now(),
      },
      { status: 200 },
    ) // Return 200 even on error to prevent client from breaking
  }
}

// Handle message posting through the same endpoint
export async function POST(request: NextRequest) {
  try {
    const { type, data } = await request.json()

    if (type === "message") {
      const message = data as ChatMessage

      // Validate the message
      if (!message.content && !message.file) {
        return NextResponse.json({ error: "Message must have content or a file" }, { status: 400 })
      }

      if (!message.sender || !message.senderId) {
        return NextResponse.json({ error: "Message must have a sender" }, { status: 400 })
      }

      // Add timestamp if not provided
      if (!message.timestamp) {
        message.timestamp = Date.now()
      }

      // Add message ID if not provided
      if (!message.id) {
        message.id = Date.now().toString()
      }

      // Set message type if not provided
      if (!message.type) {
        message.type = "message"
      }

      const success = await addMessage(message)

      if (success) {
        return NextResponse.json({ success: true, message })
      } else {
        return NextResponse.json({ error: "Failed to add message" }, { status: 500 })
      }
    } else if (type === "user") {
      const user = data

      // Validate the user
      if (!user.id || !user.name) {
        return NextResponse.json({ error: "User must have an ID and name" }, { status: 400 })
      }

      // Add lastSeen if not provided
      if (!user.lastSeen) {
        user.lastSeen = Date.now()
      }

      const success = await updateUser(user)

      if (success) {
        return NextResponse.json({ success: true, user })
      } else {
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: "Invalid operation type" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error in polling POST endpoint:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
