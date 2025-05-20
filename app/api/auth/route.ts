import { type NextRequest, NextResponse } from "next/server"
import { createUserAccount, getUserByIp } from "@/lib/redis"

// Get client IP address from request
function getClientIp(request: NextRequest): string {
  // Try to get IP from Vercel-specific headers
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }

  // Try to get IP from standard headers
  const realIp = request.headers.get("x-real-ip")
  if (realIp) {
    return realIp
  }

  // Fallback to a placeholder IP if we can't determine the real one
  return "127.0.0.1"
}

// GET handler to check if user is logged in
export async function GET(request: NextRequest) {
  try {
    const ipAddress = getClientIp(request)
    const user = await getUserByIp(ipAddress)

    if (user) {
      // User found, return user data
      return NextResponse.json({
        loggedIn: true,
        user: {
          id: user.id,
          username: user.username,
        },
      })
    } else {
      // No user found for this IP
      return NextResponse.json({ loggedIn: false })
    }
  } catch (error) {
    console.error("Error checking auth status:", error)
    return NextResponse.json({ error: "Failed to check auth status" }, { status: 500 })
  }
}

// POST handler to register a new user
export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    const ipAddress = getClientIp(request)

    // Check if user already exists for this IP
    const existingUser = await getUserByIp(ipAddress)
    if (existingUser) {
      return NextResponse.json({
        success: true,
        user: {
          id: existingUser.id,
          username: existingUser.username,
        },
        message: "Already logged in",
      })
    }

    // Validate username
    if (!username || typeof username !== "string" || username.length < 3 || username.length > 20) {
      return NextResponse.json(
        {
          success: false,
          error: "Username must be between 3 and 20 characters",
        },
        { status: 400 },
      )
    }

    // Create new user account
    const newUser = await createUserAccount(username, ipAddress)
    if (!newUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Username already taken or error creating account",
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
      },
    })
  } catch (error) {
    console.error("Error registering user:", error)
    return NextResponse.json({ error: "Failed to register user" }, { status: 500 })
  }
}
