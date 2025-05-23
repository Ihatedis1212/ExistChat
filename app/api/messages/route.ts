import { type NextRequest, NextResponse } from "next/server"
import { addMessage, getMessages } from "@/lib/redis"

// GET handler to fetch all messages
export async function GET() {
  try {
    const messages = await getMessages()
    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Error fetching messages:", error)
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
  }
}

// POST handler to add a new message
export async function POST(request: NextRequest) {
  try {
    const message = await request.json()

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
  } catch (error) {
    console.error("Error adding message:", error)
    return NextResponse.json({ error: "Failed to add message" }, { status: 500 })
  }
}
