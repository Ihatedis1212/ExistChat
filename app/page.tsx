"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Send } from "lucide-react"

interface Message {
  id: string
  content: string
  sender: string
  timestamp: number
  file?: {
    name: string
    type: string
    url: string
    size: number
  }
}

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [username, setUsername] = useState("")
  const [isUsernameSet, setIsUsernameSet] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Simulate fetching messages from server
  useEffect(() => {
    const fetchMessages = async () => {
      // In a real app, you would fetch messages from your API
      const initialMessages: Message[] = [
        {
          id: "1",
          content: "Welcome to the chat!",
          sender: "System",
          timestamp: Date.now() - 60000,
        },
      ]
      setMessages(initialMessages)
    }

    fetchMessages()

    // Set up polling for new messages
    const interval = setInterval(() => {
      // In a real app, you would poll for new messages
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() && !selectedFile) return

    const message: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: username,
      timestamp: Date.now(),
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

    // In a real app, you would send the message to your API
    setMessages((prev) => [...prev, message])
    setNewMessage("")
    setSelectedFile(null)

    // Simulate receiving a response
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        content: `Hi ${username}, thanks for your message!`,
        sender: "ChatBot",
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, response])
    }, 1000)
  }

  const handleSetUsername = (e: React.FormEvent) => {
    e.preventDefault()
    if (username.trim()) {
      setIsUsernameSet(true)
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

  if (!isUsernameSet) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Join the Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetUsername} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button type="submit" className="w-full">
                Join Chat
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r bg-white">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Chat App</h2>
        </div>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Online Users</h3>
          <div className="mt-2 space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>{username} (You)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>ChatBot</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <header className="flex items-center p-4 border-b bg-white">
          <div className="flex items-center space-x-2">
            <Avatar>
              <AvatarImage src="/placeholder.svg?height=40&width=40" alt="ChatBot" />
              <AvatarFallback>CB</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold">ChatBot</h2>
              <p className="text-xs text-gray-500">Online</p>
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === username ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.sender === username ? "bg-blue-500 text-white" : "bg-gray-200"
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-sm">{message.sender}</span>
                    <span className="text-xs opacity-70">{formatTime(message.timestamp)}</span>
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
                            <div className="text-sm font-medium truncate max-w-[200px]">{message.file.name}</div>
                            <div className="text-xs opacity-70">{formatFileSize(message.file.size)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
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
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 pr-10"
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
                <input id="file-upload" type="file" className="hidden" onChange={handleFileSelect} />
              </label>
            </div>
            <Button type="submit" size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </footer>
      </div>
    </div>
  )
}
