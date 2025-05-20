import type { NextRequest } from "next/server"
import { redis } from "@/lib/redis"

// Server-Sent Events handler
export async function GET(request: NextRequest) {
  const responseStream = new TransformStream()
  const writer = responseStream.writable.getWriter()
  const encoder = new TextEncoder()

  // Set up headers for SSE
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  }

  try {
    // Subscribe to Redis channel for updates
    const subscription = redis.subscribe("chat:updates")

    // Send initial connection message
    const initialMessage = encoder.encode("event: connected\ndata: {}\n\n")
    await writer.write(initialMessage)(
      // Listen for messages from Redis
      async () => {
        for await (const message of subscription) {
          try {
            // Format the message for SSE
            const formattedMessage = `event: update\ndata: ${message}\n\n`
            await writer.write(encoder.encode(formattedMessage))
          } catch (error) {
            console.error("Error sending SSE message:", error)
            break
          }
        }
      },
    )()

    // Handle client disconnect
    request.signal.addEventListener("abort", async () => {
      await subscription.unsubscribe()
      await writer.close()
    })

    return new Response(responseStream.readable, { headers })
  } catch (error) {
    console.error("Error setting up SSE:", error)
    await writer.close()
    return new Response("Error setting up event stream", { status: 500 })
  }
}
