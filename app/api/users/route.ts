import { type NextRequest, NextResponse } from "next/server"
import { getUsers, updateUser, removeUser, cleanupUsers } from "@/lib/redis"

// GET handler to fetch all users
export async function GET() {
  try {
    // Clean up users who haven't been seen in 5 minutes
    await cleanupUsers()

    const users = await getUsers()
    return NextResponse.json({ users })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

// POST handler to add or update a user
export async function POST(request: NextRequest) {
  try {
    const user = await request.json()

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
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

// DELETE handler to remove a user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("id")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const success = await removeUser(userId)

    if (success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: "Failed to remove user" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error removing user:", error)
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 })
  }
}
