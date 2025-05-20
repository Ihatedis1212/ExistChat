"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Send, Users, Wifi, WifiOff, Clock, UserCircle, Hash } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { usePolling } from "@/hooks/use-polling"
import { useToast } from "@/hooks/use-toast"
import { CreateRoomDialog } from "@/components/create-room-dialog"
import { RoomList } from "@/components/room-list"
import type { ChatMessage, Chatroom } from "@/lib/redis"

export default function ChatApp() {
  const [newMessage, setNewMessage] = useState("")
  const [username, setUsername] = useState("")
  const [userId, setUserId] = useState("")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [rooms, setRooms] = useState<Chatroom[]>([])
  const [currentRoom, setCurrentRoom] = useState<Chatroom | null>(null)
  const [isLoadingRooms, setIsLoadingRooms] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Use polling for all real-time updates
  const { messages = [], users = [], isPolling, error, sendMessage, updateUser } = usePolling(2000)

  // Fetch rooms
  const fetchRooms = async () => {
    try {
      setIsLoadingRooms(true)
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
    } catch (error) {
      console.error("Error fetching rooms:", error)
      toast({
        title: "Error",
        description: "Failed to fetch chat rooms. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingRooms(false)
    }
  }

  // Handle room selection
  const handleRoomSelect = async (roomId: string) => {
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
        } else {
          throw new Error(`Room not found: ${roomId}`)
        }
      } else {
        setCurrentRoom(room)
      }
    } catch (error) {
      console.error("Error selecting room:", error)
      toast({
        title: "Error",
        description: "Failed to select room. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle username submission
  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || username.trim().length < 3) {
      toast({
        title: "Invalid username",
        description: "Username must be at least 3 characters",
        variant: "destructive",
      })
      return
    }

    // Generate a random user ID
    const generatedUserId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    setUserId(generatedUserId)
    setIsLoggedIn(true)

    // Update user presence
    updateUser({
      id: generatedUserId,
      name: username,
      lastSeen: Date.now(),
    })

    // Fetch rooms
    fetchRooms()

    toast({
      title: "Welcome!",
      description: "You've successfully joined the chat.",
    })
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Keep user presence updated
  useEffect(() => {
    if (!isLoggedIn || !userId) return

    // Update user presence every 30 seconds
    const updatePresence = async () => {
      try {
        await updateUser({
          id: userId,
          name: username,
          lastSeen: Date.now(),
        })
      } catch (error) {
        console.error("Error updating presence:", error)
      }
    }

    // Update presence immediately and then every 30 seconds
    updatePresence()
    const interval = setInterval(updatePresence, 30000)

    // Clean up on unmount
    return () => {
      clearInterval(interval)
    }
  }, [isLoggedIn, userId, username, updateUser])

  // Show error toast if polling fails
  useEffect(() => {
    if (error) {
      toast({
        title: "Connection Issue",
        description: "Having trouble connecting to the chat server. Will keep trying.",
        variant: "destructive",
      })
    }
  }, [error, toast])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() && !selectedFile) return
    if (!currentRoom) {
      toast({
        title: "Error",
        description: "Please select a room first",
        variant: "destructive",
      })
      return
    }

    const message: ChatMessage = {
      id: Date.now().toString(),
      content: newMessage,
      sender: username,
      senderId: userId,
      timestamp: Date.now(),
      type: "message",
      roomId: currentRoom.id,
    }

    if (selectedFile) {
      // In a real app, you would upload the file to a storage service
      // and get back a URL. Here we're creating an object URL as a simulation
      const fileUrl = URL.createObjectURL(selectedFile)
      message.file = {
        name: selectedFile.name,
        type: selectedFile.type,
        url: fileUrl,
        size: selectedFile.size,
      }
    }

    try {
      // Optimistically update UI
      setMessages((prev) => [...prev, message])
      setNewMessage("")
      setSelectedFile(null)

      // Send message to server
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      })

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`)
      }
    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      })
      // Remove the optimistically added message
      setMessages((prev) => prev.filter((m) => m.id !== message.id))
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " bytes"
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
    else return (bytes / 1048576).toFixed(1) + " MB"
  }

  const getOnlineUsers = () => {
    // Ensure users is defined before filtering
    if (!users || !Array.isArray(users)) {
      return []
    }

    // Consider users online if they've been seen in the last 2 minutes
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000
    return users.filter((user) => user && user.lastSeen && user.lastSeen > twoMinutesAgo)
  }

  // For optimistic UI updates
  const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    const updatedMessages = updater(messages || [])
    // This doesn't actually update the state since we're using the polling hook
    // But it's useful for optimistic UI updates
    return updatedMessages
  }

  // Calculate when messages will expire
  const getExpiryTime = (timestamp: number) => {
    const expiryTime = timestamp + 60 * 60 * 1000 // 1 hour after the message was sent
    const now = Date.now()
    const timeLeft = expiryTime - now

    if (timeLeft <= 0) {
      return "Expiring soon"
    }

    const minutesLeft = Math.floor(timeLeft / (60 * 1000))
    if (minutesLeft < 60) {
      return `Expires in ${minutesLeft} min`
    }

    return `Expires in 1 hour`
  }

  // Filter messages for the current room
  const roomMessages = currentRoom && messages ? messages.filter((msg) => msg && msg.roomId === currentRoom.id) : []

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Join the Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUsernameSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full"
                  minLength={3}
                  maxLength={20}
                  required
                />
                <p className="text-xs text-gray-500">Username must be between 3 and 20 characters</p>
              </div>
              <div className="text-xs text-gray-500 text-center">
                <Clock className="inline-block h-3 w-3 mr-1" />
                Messages in this chat expire after 1 hour
              </div>
              <Button type="submit" className="w-full" disabled={!username.trim() || isLoading}>
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Joining...
                  </div>
                ) : (
                  "Join Chat"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const onlineUsers = getOnlineUsers()

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r bg-white">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Chat App</h2>
          <div className="mt-1 flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${!error ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-xs text-gray-500 flex items-center">
              {!error ? (
                <>
                  <Wifi className="h-3 w-3 mr-1" /> Connected {isPolling && "(Updating...)"}
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 mr-1" /> Reconnecting...
                </>
              )}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500 flex items-center">
            <Clock className="h-3 w-3 mr-1" /> Messages expire after 1 hour
          </div>
          <div className="mt-1 text-xs text-gray-500 flex items-center">
            <UserCircle className="h-3 w-3 mr-1" /> Chatting as {username}
          </div>
        </div>

        {/* Room List */}
        <div className="p-4 border-b">
          {isLoadingRooms ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
            </div>
          ) : (
            <RoomList
              rooms={rooms}
              currentRoomId={currentRoom?.id || ""}
              onRoomSelect={handleRoomSelect}
              onRoomsRefresh={fetchRooms}
              userId={userId}
            />
          )}
        </div>

        {/* Online Users */}
        <div className="p-4 flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Online Users ({onlineUsers.length})</h3>
          </div>
          <div className="mt-2 space-y-2">
            {onlineUsers.map((user) => (
              <div key={user.id} className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>
                  {user.name} {user.id === userId ? "(You)" : ""}
                </span>
              </div>
            ))}
            {onlineUsers.length === 0 && <div className="text-xs text-gray-500">No users online</div>}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between p-4 border-b bg-white">
          <div className="flex items-center space-x-2">
            <Avatar>
              <AvatarImage src="/placeholder.svg?height=40&width=40" alt="Chat Room" />
              <AvatarFallback>{currentRoom ? currentRoom.name.charAt(0) : "C"}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center">
                {currentRoom?.isPrivate ? (
                  <span className="mr-1 text-gray-500">🔒</span>
                ) : (
                  <Hash className="h-4 w-4 mr-1 text-gray-500" />
                )}
                <h2 className="font-semibold">{currentRoom?.name || "Select a Room"}</h2>
              </div>
              {currentRoom && (
                <p className="text-xs text-gray-500">
                  {currentRoom.description || "No description"} • {currentRoom.members.length} members
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center">
            <div className="text-xs text-gray-500 mr-4 hidden sm:flex items-center">
              <UserCircle className="h-3 w-3 mr-1" /> {username}
            </div>
            <div className="text-xs text-gray-500 mr-4 hidden sm:flex items-center">
              <Clock className="h-3 w-3 mr-1" /> Messages expire after 1 hour
            </div>
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Users className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled className="text-xs text-gray-500">
                    Chatting as {username}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled className="text-xs text-gray-500">
                    Online Users ({onlineUsers.length})
                  </DropdownMenuItem>
                  {onlineUsers.map((user) => (
                    <DropdownMenuItem key={user.id}>
                      {user.name} {user.id === userId ? "(You)" : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {!currentRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <Hash className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-xl font-medium text-gray-700 mb-2">Select a Room</h3>
            <p className="text-gray-500 mb-6 max-w-md">
              Choose a room from the sidebar or create a new one to start chatting
            </p>
            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => {
                  if (rooms.length > 0) {
                    handleRoomSelect(rooms[0].id)
                  }
                }}
                disabled={rooms.length === 0}
              >
                <Hash className="h-4 w-4" />
                Join General
              </Button>
              <CreateRoomDialog onRoomCreated={fetchRooms} />
            </div>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 p-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  {roomMessages.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      <div className="mb-2">No messages yet</div>
                      <div className="text-xs">Be the first to send a message in this room!</div>
                      <div className="text-xs mt-1">
                        <Clock className="inline-block h-3 w-3 mr-1" />
                        Messages expire after 1 hour
                      </div>
                    </div>
                  )}
                  {roomMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.senderId === userId ? "justify-end" : "justify-start"}`}
                    >
                      {message.type === "system" ? (
                        <div className="bg-gray-100 text-gray-600 text-xs py-1 px-3 rounded-full mx-auto">
                          {message.content}
                        </div>
                      ) : (
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            message.senderId === userId ? "bg-blue-500 text-white" : "bg-gray-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{message.sender}</span>
                            <div className="flex items-center">
                              <span className="text-xs opacity-70 mr-1">{formatTime(message.timestamp)}</span>
                              <span
                                className={`text-xs ${
                                  message.senderId === userId ? "text-blue-200" : "text-gray-500"
                                } hidden sm:inline-block`}
                              >
                                • {getExpiryTime(message.timestamp)}
                              </span>
                            </div>
                          </div>
                          {message.content && <p className="mb-2">{message.content}</p>}
                          {message.file && (
                            <div className="mt-2">
                              {message.file.type.startsWith("image/") ? (
                                <div>
                                  <img
                                    src={message.file.url || "/placeholder.svg"}
                                    alt={message.file.name}
                                    className="rounded-md max-h-60 max-w-full object-contain mb-1"
                                  />
                                  <div className="flex items-center text-xs mt-1">
                                    <span>{message.file.name}</span>
                                    <span className="ml-2 opacity-70">({formatFileSize(message.file.size)})</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center p-2 bg-opacity-20 bg-black rounded">
                                  <div className="mr-2">
                                    <svg
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                      <path
                                        d="M14 2V8H20"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium truncate max-w-[200px]">
                                      {message.file.name}
                                    </div>
                                    <div className="text-xs opacity-70">{formatFileSize(message.file.size)}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <Separator />

            <footer className="p-4 bg-white">
              {selectedFile && (
                <div className="mb-2 p-2 bg-gray-100 rounded-md flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center mr-2">
                      {selectedFile.type.startsWith("image/") ? (
                        <img
                          src={URL.createObjectURL(selectedFile) || "/placeholder.svg"}
                          alt="Preview"
                          className="w-8 h-8 object-cover rounded"
                        />
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</div>
                      <div className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedFile(null)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 6L18 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Button>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <div className="relative flex-1 flex">
                  <Input
                    type="text"
                    placeholder={`Message ${currentRoom ? `#${currentRoom.name}` : ""}`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 pr-10"
                    disabled={!currentRoom}
                  />
                  <label htmlFor="file-upload" className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M21.44 11.05L12.25 20.24C11.1242 21.3658 9.59723 21.9983 8.005 21.9983C6.41277 21.9983 4.88584 21.3658 3.76 20.24C2.63416 19.1142 2.00166 17.5872 2.00166 15.995C2.00166 14.4028 2.63416 12.8758 3.76 11.75L12.33 3.18C13.0806 2.42975 14.0991 2.00129 15.16 2.00129C16.2209 2.00129 17.2394 2.42975 17.99 3.18C18.7403 3.93063 19.1687 4.94905 19.1687 6.01C19.1687 7.07095 18.7403 8.08938 17.99 8.84L9.41 17.41C9.03472 17.7853 8.52573 17.9961 7.995 17.9961C7.46427 17.9961 6.95528 17.7853 6.58 17.41C6.20472 17.0347 5.99389 16.5257 5.99389 15.995C5.99389 15.4643 6.20472 14.9553 6.58 14.58L15.07 6.1"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={!currentRoom}
                    />
                  </label>
                </div>
                <Button
                  type="submit"
                  size="icon"
                  disabled={(!newMessage.trim() && !selectedFile) || isLoading || !currentRoom}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
