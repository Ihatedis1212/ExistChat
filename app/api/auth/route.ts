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
  // In development, we'll use a consistent IP so auto-login works
  return process.env.NODE_ENV === "development" ? "127.0.0.1" : request.ip || "127.0.0.1"
}

// GET handler to check if user is logged in
export async function GET(request: NextRequest) {
  try {
    const ipAddress = getClientIp(request)
    console.log("Checking auth for IP:", ipAddress)

    const user = await getUserByIp(ipAddress)
    console.log("User found for IP:", user)

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
    return NextResponse.json({ loggedIn: false, error: "Failed to check auth status" })
  }
}

// POST handler to register a new user
export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    const ipAddress = getClientIp(request)
    console.log("Registering user for IP:", ipAddress, "Username:", username)

    // Check if user already exists for this IP
    const existingUser = await getUserByIp(ipAddress)
    if (existingUser) {
      console.log("User already exists for this IP:", existingUser)
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
    console.log("Created new user:", newUser)

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
    return NextResponse.json({ success: false, error: "Failed to register user" }, { status: 500 })
  }
}
