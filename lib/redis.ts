import { Redis } from "@upstash/redis"

// Initialize Redis client using environment variables
export const redis = Redis.fromEnv()

// Message structure
export interface ChatMessage {
  id: string
  content: string
  sender: string
  senderId: string
  timestamp: number
  type: "message" | "system"
  file?: {
    name: string
    type: string
    url: string
    size: number
  }
}

// User structure
export interface ChatUser {
  id: string
  name: string
  lastSeen: number
}

// Redis keys
const MESSAGES_KEY = "chat:messages"
const USERS_KEY = "chat:users"

// Get all messages
export async function getMessages(): Promise<ChatMessage[]> {
  try {
    const messages = await redis.lrange(MESSAGES_KEY, 0, -1)
    return messages.map((msg) => JSON.parse(msg)) as ChatMessage[]
  } catch (error) {
    console.error("Error fetching messages:", error)
    return []
  }
}

// Add a new message
export async function addMessage(message: ChatMessage): Promise<boolean> {
  try {
    await redis.lpush(MESSAGES_KEY, JSON.stringify(message))
    // Publish the message to the channel for real-time updates
    await redis.publish(
      "chat:updates",
      JSON.stringify({
        type: "new-message",
        data: message,
      }),
    )
    return true
  } catch (error) {
    console.error("Error adding message:", error)
    return false
  }
}

// Get all online users
export async function getUsers(): Promise<ChatUser[]> {
  try {
    const users = await redis.hgetall(USERS_KEY)
    return Object.entries(users).map(([id, userData]) => {
      const user = JSON.parse(userData as string)
      return {
        id,
        name: user.name,
        lastSeen: user.lastSeen,
      }
    })
  } catch (error) {
    console.error("Error fetching users:", error)
    return []
  }
}

// Add or update a user
export async function updateUser(user: ChatUser): Promise<boolean> {
  try {
    await redis.hset(USERS_KEY, {
      [user.id]: JSON.stringify({
        name: user.name,
        lastSeen: user.lastSeen,
      }),
    })
    // Publish the user update to the channel
    await redis.publish(
      "chat:updates",
      JSON.stringify({
        type: "user-update",
        data: user,
      }),
    )
    return true
  } catch (error) {
    console.error("Error updating user:", error)
    return false
  }
}

// Remove a user (when they go offline)
export async function removeUser(userId: string): Promise<boolean> {
  try {
    await redis.hdel(USERS_KEY, userId)
    // Publish the user removal to the channel
    await redis.publish(
      "chat:updates",
      JSON.stringify({
        type: "user-remove",
        data: { id: userId },
      }),
    )
    return true
  } catch (error) {
    console.error("Error removing user:", error)
    return false
  }
}

// Clean up old users (those who haven't been seen in a while)
export async function cleanupUsers(maxAgeMs: number = 5 * 60 * 1000): Promise<void> {
  try {
    const users = await getUsers()
    const now = Date.now()

    for (const user of users) {
      if (now - user.lastSeen > maxAgeMs) {
        await removeUser(user.id)
      }
    }
  } catch (error) {
    console.error("Error cleaning up users:", error)
  }
}

export async function subscribeToChannel(channelId: string, callback: (message: any) => void) {
  // In a real app, you would subscribe to a Redis channel
  return () => {
    // Unsubscribe function
  }
}
