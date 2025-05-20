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
  roomId: string
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
  currentRoomId?: string
}

// Chatroom structure
export interface Chatroom {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt: number
  isPrivate: boolean
  members: string[]
}

// Redis keys
const MESSAGES_KEY_PREFIX = "chat:messages:" // Changed to prefix for room-specific messages
const USERS_KEY = "chat:users"
const ROOMS_KEY = "chat:rooms"
const USERS_BY_IP_KEY = "chat:users_by_ip"

// Helper function to safely parse JSON
function safeJsonParse<T>(jsonString: string | unknown, defaultValue: T): T {
  if (typeof jsonString === "object" && jsonString !== null) {
    return jsonString as T
  }

  try {
    return JSON.parse(jsonString as string) as T
  } catch (e) {
    console.error("Error parsing JSON:", e, jsonString)
    return defaultValue
  }
}

// Get messages for a specific room (only from the last hour)
export async function getMessages(roomId: string): Promise<ChatMessage[]> {
  try {
    const messagesKey = `${MESSAGES_KEY_PREFIX}${roomId}`
    const messages = await redis.lrange(messagesKey, 0, -1)
    const oneHourAgo = Date.now() - 60 * 60 * 1000 // 1 hour in milliseconds

    // Safely parse each message and filter out old ones
    return messages
      .map((msg) => {
        const defaultMessage: ChatMessage = {
          id: "error",
          content: "Error loading message",
          sender: "System",
          senderId: "system",
          timestamp: Date.now(),
          type: "system",
          roomId,
        }

        return safeJsonParse<ChatMessage>(msg, defaultMessage)
      })
      .filter((msg) => msg.timestamp >= oneHourAgo) // Only keep messages from the last hour
  } catch (error) {
    console.error("Error fetching messages:", error)
    return []
  }
}

// Add a message to a specific room
export async function addMessage(message: ChatMessage): Promise<boolean> {
  try {
    if (!message.roomId) {
      console.error("Message must have a roomId")
      return false
    }

    const messagesKey = `${MESSAGES_KEY_PREFIX}${message.roomId}`

    // Always stringify the message before storing
    const messageString = JSON.stringify(message)

    // Use rpush to add messages to the end of the list (newest at the bottom)
    await redis.rpush(messagesKey, messageString)

    // Publish the message to the channel for real-time updates
    await redis.publish(
      `chat:updates:${message.roomId}`,
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

// Delete old messages from all rooms
export async function deleteAllOldMessages(): Promise<number> {
  try {
    // Get all room IDs
    const rooms = await getChatrooms()
    let totalDeletedCount = 0

    // Delete old messages from each room
    for (const room of rooms) {
      const messagesKey = `${MESSAGES_KEY_PREFIX}${room.id}`
      const messages = await redis.lrange(messagesKey, 0, -1)
      const oneHourAgo = Date.now() - 60 * 60 * 1000 // 1 hour in milliseconds
      let deletedCount = 0

      // Find messages older than 1 hour
      const messagesToDelete = messages
        .map((msg, index) => {
          const defaultMessage = { timestamp: Date.now() }
          const parsedMsg = safeJsonParse(msg, defaultMessage)
          return { index, timestamp: parsedMsg.timestamp }
        })
        .filter((msg) => msg.timestamp < oneHourAgo)

      // Delete old messages one by one
      for (const msg of messagesToDelete) {
        try {
          // Get the message at the index
          const messageAtIndex = await redis.lindex(messagesKey, msg.index)
          if (messageAtIndex) {
            // Remove the message from the list
            await redis.lrem(messagesKey, 1, messageAtIndex)
            deletedCount++
          }
        } catch (e) {
          console.error("Error deleting message:", e)
        }
      }

      totalDeletedCount += deletedCount
    }

    console.log(`Deleted ${totalDeletedCount} old messages across all rooms`)
    return totalDeletedCount
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
      const defaultUser: ChatUser = {
        id,
        name: "Unknown",
        lastSeen: Date.now(),
      }

      return safeJsonParse<ChatUser>(userData, defaultUser)
    })
  } catch (error) {
    console.error("Error fetching users:", error)
    return []
  }
}

// Add or update a user
export async function updateUser(user: ChatUser): Promise<boolean> {
  try {
    // Always stringify the user data before storing
    const userData = JSON.stringify({
      name: user.name,
      lastSeen: user.lastSeen,
      currentRoomId: user.currentRoomId,
    })

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

// Chatroom functions

// Create a new chatroom
export async function createChatroom(roomData: Omit<Chatroom, "createdAt">): Promise<Chatroom | null> {
  try {
    // Check if room ID already exists
    const existingRoom = await getChatroom(roomData.id)
    if (existingRoom) {
      console.log("Room ID already exists:", roomData.id)
      return null
    }

    const room: Chatroom = {
      ...roomData,
      createdAt: Date.now(),
    }

    // Always stringify the room data before storing
    const roomString = JSON.stringify(room)

    // Store the room in Redis
    await redis.hset(ROOMS_KEY, {
      [room.id]: roomString,
    })

    console.log("Room created successfully:", room)
    return room
  } catch (error) {
    console.error("Error creating room:", error)
    return null
  }
}

// Get a specific chatroom
export async function getChatroom(roomId: string): Promise<Chatroom | null> {
  try {
    const roomData = await redis.hget(ROOMS_KEY, roomId)

    if (!roomData) {
      return null
    }

    const defaultRoom: Chatroom = {
      id: roomId,
      name: "Unknown Room",
      description: "",
      createdBy: "system",
      createdAt: Date.now(),
      isPrivate: false,
      members: [],
    }

    return safeJsonParse<Chatroom>(roomData, defaultRoom)
  } catch (error) {
    console.error("Error getting room:", error)
    return null
  }
}

// Get all chatrooms
export async function getChatrooms(): Promise<Chatroom[]> {
  try {
    const rooms = await redis.hgetall(ROOMS_KEY)

    if (!rooms) return []

    return Object.entries(rooms)
      .map(([roomId, roomData]) => {
        const defaultRoom: Chatroom = {
          id: roomId,
          name: "Unknown Room",
          description: "",
          createdBy: "system",
          createdAt: Date.now(),
          isPrivate: false,
          members: [],
        }

        return safeJsonParse<Chatroom>(roomData, defaultRoom)
      })
      .filter((room) => room !== null)
  } catch (error) {
    console.error("Error fetching rooms:", error)
    return []
  }
}

// Join a chatroom
export async function joinChatroom(roomId: string, userId: string): Promise<boolean> {
  try {
    const room = await getChatroom(roomId)

    if (!room) {
      console.log("Room not found:", roomId)
      return false
    }

    // Check if user is already a member
    if (room.members.includes(userId)) {
      console.log("User already a member of room:", roomId)
      return true
    }

    // Add user to members
    room.members.push(userId)

    // Always stringify the room data before storing
    const roomString = JSON.stringify(room)

    // Update room in Redis
    await redis.hset(ROOMS_KEY, {
      [roomId]: roomString,
    })

    // Add system message to room
    const user = await getUserById(userId)
    if (user) {
      const joinMessage: ChatMessage = {
        id: Date.now().toString(),
        content: `${user.name} has joined the room`,
        sender: "System",
        senderId: "system",
        timestamp: Date.now(),
        type: "system",
        roomId,
      }

      await addMessage(joinMessage)
    }

    console.log("User joined room successfully:", userId, roomId)
    return true
  } catch (error) {
    console.error("Error joining room:", error)
    return false
  }
}

// Leave a chatroom
export async function leaveChatroom(roomId: string, userId: string): Promise<boolean> {
  try {
    const room = await getChatroom(roomId)

    if (!room) {
      console.log("Room not found:", roomId)
      return false
    }

    // Check if user is a member
    if (!room.members.includes(userId)) {
      console.log("User not a member of room:", roomId)
      return true
    }

    // Remove user from members
    room.members = room.members.filter((id) => id !== userId)

    // Always stringify the room data before storing
    const roomString = JSON.stringify(room)

    // Update room in Redis
    await redis.hset(ROOMS_KEY, {
      [roomId]: roomString,
    })

    // Add system message to room
    const user = await getUserById(userId)
    if (user) {
      const leaveMessage: ChatMessage = {
        id: Date.now().toString(),
        content: `${user.name} has left the room`,
        sender: "System",
        senderId: "system",
        timestamp: Date.now(),
        type: "system",
        roomId,
      }

      await addMessage(leaveMessage)
    }

    console.log("User left room successfully:", userId, roomId)
    return true
  } catch (error) {
    console.error("Error leaving room:", error)
    return false
  }
}

// Delete a chatroom
export async function deleteChatroom(roomId: string): Promise<boolean> {
  try {
    // Delete room from Redis
    await redis.hdel(ROOMS_KEY, roomId)

    // Delete all messages for this room
    const messagesKey = `${MESSAGES_KEY_PREFIX}${roomId}`
    await redis.del(messagesKey)

    console.log("Room deleted successfully:", roomId)
    return true
  } catch (error) {
    console.error("Error deleting room:", error)
    return false
  }
}

// Get user by ID
export async function getUserById(userId: string): Promise<ChatUser | null> {
  try {
    const userData = await redis.hget(USERS_KEY, userId)

    if (!userData) {
      return null
    }

    const defaultUser: ChatUser = {
      id: userId,
      name: "Unknown",
      lastSeen: Date.now(),
    }

    const parsedData = safeJsonParse(userData, defaultUser)

    return {
      id: userId,
      name: parsedData.name,
      lastSeen: parsedData.lastSeen || Date.now(),
      currentRoomId: parsedData.currentRoomId,
    }
  } catch (error) {
    console.error("Error getting user by ID:", error)
    return null
  }
}

// Get users in a specific chatroom
export async function getUsersInRoom(roomId: string): Promise<ChatUser[]> {
  try {
    const room = await getChatroom(roomId)
    if (!room) {
      console.log("Room not found:", roomId)
      return []
    }

    const userIds = room.members
    const users: ChatUser[] = []

    for (const userId of userIds) {
      const user = await getUserById(userId)
      if (user) {
        users.push(user)
      }
    }

    return users
  } catch (error) {
    console.error("Error getting users in room:", error)
    return []
  }
}

// Create a default "General" room if no rooms exist
export async function initializeDefaultRoom(): Promise<void> {
  try {
    const rooms = await getChatrooms()

    if (rooms.length === 0) {
      console.log("Creating default General room")

      await createChatroom({
        id: "general",
        name: "General",
        description: "General discussion",
        createdBy: "system",
        isPrivate: false,
        members: [],
      })
    }
  } catch (error) {
    console.error("Error ensuring default room:", error)
  }
}

// Create a new user account
export async function createUserAccount(username: string, ipAddress: string): Promise<ChatUser | null> {
  try {
    // Generate a unique user ID
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Create the user object
    const newUser: ChatUser = {
      id: userId,
      name: username,
      lastSeen: Date.now(),
    }

    // Store the user in Redis
    await updateUser(newUser)

    // Map the IP address to the user ID
    await redis.hset(USERS_BY_IP_KEY, {
      [ipAddress]: userId,
    })

    console.log("Created new user:", newUser, "for IP:", ipAddress)
    return newUser
  } catch (error) {
    console.error("Error creating user account:", error)
    return null
  }
}

// Get user by IP address
export async function getUserByIp(ipAddress: string): Promise<ChatUser | null> {
  try {
    // Get the user ID associated with the IP address
    const userId = await redis.hget(USERS_BY_IP_KEY, ipAddress)

    if (!userId) {
      console.log("No user found for IP:", ipAddress)
      return null
    }

    // Get the user data by ID
    const user = await getUserById(userId)

    if (!user) {
      console.log("User not found for ID:", userId)
      return null
    }

    return user
  } catch (error) {
    console.error("Error getting user by IP:", error)
    return null
  }
}
