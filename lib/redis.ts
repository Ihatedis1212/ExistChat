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

// User account structure
export interface UserAccount {
  id: string
  username: string
  ipAddress: string
  createdAt: number
  lastLogin: number
}

// Redis keys
const MESSAGES_KEY = "chat:messages"
const USERS_KEY = "chat:users"
const ACCOUNTS_KEY = "chat:accounts"
const IP_TO_USER_KEY = "chat:ip_to_user"

// Get all messages (only from the last hour)
export async function getMessages(): Promise<ChatMessage[]> {
  try {
    const messages = await redis.lrange(MESSAGES_KEY, 0, -1)
    const oneHourAgo = Date.now() - 60 * 60 * 1000 // 1 hour in milliseconds

    // Safely parse each message and filter out old ones
    return messages
      .map((msg) => {
        // If it's already an object, return it directly
        if (typeof msg === "object" && msg !== null) {
          return msg as ChatMessage
        }

        // Otherwise, try to parse it as JSON
        try {
          return JSON.parse(msg as string) as ChatMessage
        } catch (e) {
          console.error("Error parsing message:", e, msg)
          // Return a default message if parsing fails
          return {
            id: "error",
            content: "Error loading message",
            sender: "System",
            senderId: "system",
            timestamp: Date.now(),
            type: "system",
          }
        }
      })
      .filter((msg) => msg.timestamp >= oneHourAgo) // Only keep messages from the last hour
  } catch (error) {
    console.error("Error fetching messages:", error)
    return []
  }
}

// Change the addMessage function to use rpush instead of lpush
export async function addMessage(message: ChatMessage): Promise<boolean> {
  try {
    // Ensure message is a string before pushing to Redis
    const messageString = typeof message === "string" ? message : JSON.stringify(message)

    // Use rpush to add messages to the end of the list (newest at the bottom)
    await redis.rpush(MESSAGES_KEY, messageString)

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

// Update deleteOldMessages to work with the new message order
export async function deleteOldMessages(): Promise<number> {
  try {
    const messages = await redis.lrange(MESSAGES_KEY, 0, -1)
    const oneHourAgo = Date.now() - 60 * 60 * 1000 // 1 hour in milliseconds
    let deletedCount = 0

    // Find messages older than 1 hour
    const messagesToDelete = messages
      .map((msg, index) => {
        try {
          const parsedMsg = typeof msg === "object" ? msg : JSON.parse(msg as string)
          return { index, timestamp: parsedMsg.timestamp }
        } catch (e) {
          console.error("Error parsing message for deletion:", e)
          return { index, timestamp: Date.now() } // Default to current time if parsing fails
        }
      })
      .filter((msg) => msg.timestamp < oneHourAgo)

    // Delete old messages one by one
    for (const msg of messagesToDelete) {
      try {
        // Get the message at the index
        const messageAtIndex = await redis.lindex(MESSAGES_KEY, msg.index)
        if (messageAtIndex) {
          // Remove the message from the list
          await redis.lrem(MESSAGES_KEY, 1, messageAtIndex)
          deletedCount++
        }
      } catch (e) {
        console.error("Error deleting message:", e)
      }
    }

    console.log(`Deleted ${deletedCount} old messages`)
    return deletedCount
  } catch (error) {
    console.error("Error deleting old messages:", error)
    return 0
  }
}

// Get all online users
export async function getUsers(): Promise<ChatUser[]> {
  try {
    const users = await redis.hgetall(USERS_KEY)

    if (!users) return []

    return Object.entries(users).map(([id, userData]) => {
      // Handle case where userData might be an object already
      if (typeof userData === "object" && userData !== null) {
        return {
          id,
          name: (userData as any).name || "Unknown",
          lastSeen: (userData as any).lastSeen || Date.now(),
        }
      }

      // Otherwise parse as JSON
      try {
        const user = JSON.parse(userData as string)
        return {
          id,
          name: user.name,
          lastSeen: user.lastSeen,
        }
      } catch (e) {
        console.error("Error parsing user data:", e, userData)
        return {
          id,
          name: "Unknown",
          lastSeen: Date.now(),
        }
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
    // Ensure user data is a string before storing in Redis
    const userData =
      typeof user === "object"
        ? JSON.stringify({
            name: user.name,
            lastSeen: user.lastSeen,
          })
        : user

    await redis.hset(USERS_KEY, {
      [user.id]: userData,
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

// User account functions

// Create a new user account
export async function createUserAccount(username: string, ipAddress: string): Promise<UserAccount | null> {
  try {
    // Check if username is already taken
    const existingAccounts = await getUserAccounts()
    if (existingAccounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
      return null // Username already taken
    }

    const userId = `user-${Date.now()}`
    const account: UserAccount = {
      id: userId,
      username,
      ipAddress,
      createdAt: Date.now(),
      lastLogin: Date.now(),
    }

    // Store the account in Redis
    await redis.hset(ACCOUNTS_KEY, {
      [userId]: JSON.stringify(account),
    })

    // Map IP address to user ID
    await redis.hset(IP_TO_USER_KEY, {
      [ipAddress]: userId,
    })

    return account
  } catch (error) {
    console.error("Error creating user account:", error)
    return null
  }
}

// Get user account by IP address
export async function getUserByIp(ipAddress: string): Promise<UserAccount | null> {
  try {
    // Get user ID from IP mapping
    const userId = await redis.hget(IP_TO_USER_KEY, ipAddress)
    if (!userId) {
      return null // No user found for this IP
    }

    // Get user account
    const accountData = await redis.hget(ACCOUNTS_KEY, userId)
    if (!accountData) {
      return null // Account not found
    }

    try {
      const account = JSON.parse(accountData as string) as UserAccount

      // Update last login time
      account.lastLogin = Date.now()
      await redis.hset(ACCOUNTS_KEY, {
        [userId]: JSON.stringify(account),
      })

      return account
    } catch (e) {
      console.error("Error parsing account data:", e)
      return null
    }
  } catch (error) {
    console.error("Error getting user by IP:", error)
    return null
  }
}

// Get all user accounts
export async function getUserAccounts(): Promise<UserAccount[]> {
  try {
    const accounts = await redis.hgetall(ACCOUNTS_KEY)

    if (!accounts) return []

    return Object.values(accounts)
      .map((accountData) => {
        try {
          return JSON.parse(accountData as string) as UserAccount
        } catch (e) {
          console.error("Error parsing account data:", e)
          return null
        }
      })
      .filter((account): account is UserAccount => account !== null)
  } catch (error) {
    console.error("Error fetching user accounts:", error)
    return []
  }
}
